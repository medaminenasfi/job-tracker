import {
  BadRequestException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  LatexPreviewService,
  PreviewSupersededException,
} from './latex-preview.service';
import type {
  LatexCompilerService,
  PreviewOutcome,
} from './latex-compiler.service';
import type { LatexBuildService } from './latex-build.service';

// A buffer with the real PNG magic so it survives the compiler's own check.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// buildCvSchema requires a real UUID for template_id, so the fixture uses one.
const TEMPLATE_ID = '2a4b6c8d-1234-4abc-8def-0123456789ab';
const TEMPLATE = {
  id: TEMPLATE_ID,
  name: 'Classic',
  latex_source: 'Hi {{fullName}}',
};

describe('LatexPreviewService', () => {
  let compiler: {
    assertAvailable: jest.Mock<Promise<void>, []>;
    compilePreview: jest.Mock<Promise<PreviewOutcome>, [string, unknown]>;
  };
  let builds: { getActiveTemplate: jest.Mock };
  let service: LatexPreviewService;

  const buildBody = (fullName: string) => ({
    template_id: TEMPLATE_ID,
    fields: { fullName },
  });

  beforeEach(() => {
    compiler = {
      assertAvailable: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      compilePreview: jest
        .fn<Promise<PreviewOutcome>, [string, unknown]>()
        .mockResolvedValue({ ok: true, png: PNG }),
    };
    builds = {
      getActiveTemplate: jest.fn().mockResolvedValue(TEMPLATE),
    };
    service = new LatexPreviewService(
      compiler as unknown as LatexCompilerService,
      builds as unknown as LatexBuildService,
    );
    delete process.env.LATEX_PREVIEW_CACHE_TTL_MS;
  });

  describe('renderUserBuild', () => {
    it('fails fast when the sandbox is not available', async () => {
      compiler.assertAvailable.mockRejectedValue(
        new ServiceUnavailableException('down'),
      );
      await expect(
        service.renderUserBuild('u1', buildBody('Ada')),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(compiler.compilePreview).not.toHaveBeenCalled();
    });

    it('rejects an invalid payload before touching the sandbox', async () => {
      await expect(
        service.renderUserBuild('u1', { template_id: 'not-a-uuid' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(builds.getActiveTemplate).not.toHaveBeenCalled();
      expect(compiler.compilePreview).not.toHaveBeenCalled();
    });

    it('resolves the template server-side and compiles the escaped merge', async () => {
      const result = await service.renderUserBuild('u1', buildBody('Ada'));
      expect(builds.getActiveTemplate).toHaveBeenCalledWith(TEMPLATE_ID);
      // The LaTeX source comes from the DB row, never from the client payload.
      expect(compiler.compilePreview).toHaveBeenCalledWith('Hi {{fullName}}', {
        fullName: 'Ada',
      });
      expect(result).toEqual({ png: PNG, cached: false });
    });

    it('serves an identical second request from cache without recompiling', async () => {
      const first = await service.renderUserBuild('u1', buildBody('Ada'));
      const second = await service.renderUserBuild('u1', buildBody('Ada'));
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(second.png).toEqual(PNG);
      expect(compiler.compilePreview).toHaveBeenCalledTimes(1);
    });

    it('does not share a cache entry across different field values', async () => {
      await service.renderUserBuild('u1', buildBody('Ada'));
      const other = await service.renderUserBuild('u1', buildBody('Grace'));
      expect(other.cached).toBe(false);
      expect(compiler.compilePreview).toHaveBeenCalledTimes(2);
    });

    it('recompiles once the cache TTL has elapsed', async () => {
      jest.useFakeTimers();
      process.env.LATEX_PREVIEW_CACHE_TTL_MS = '1000';
      try {
        await service.renderUserBuild('u1', buildBody('Ada'));
        jest.advanceTimersByTime(1500);
        const later = await service.renderUserBuild('u1', buildBody('Ada'));
        expect(later.cached).toBe(false);
        expect(compiler.compilePreview).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
        delete process.env.LATEX_PREVIEW_CACHE_TTL_MS;
      }
    });

    it('does not cache at all when the TTL is zero', async () => {
      process.env.LATEX_PREVIEW_CACHE_TTL_MS = '0';
      try {
        await service.renderUserBuild('u1', buildBody('Ada'));
        const again = await service.renderUserBuild('u1', buildBody('Ada'));
        expect(again.cached).toBe(false);
        expect(compiler.compilePreview).toHaveBeenCalledTimes(2);
      } finally {
        delete process.env.LATEX_PREVIEW_CACHE_TTL_MS;
      }
    });

    it('supersedes an in-flight preview for the same user instead of queueing it', async () => {
      // Two requests fire before either compiles: the older one must bail with a
      // 409 *without* creating a container, so at most one preview runs per user.
      const older = service.renderUserBuild('u1', buildBody('Ada'));
      const newer = service.renderUserBuild('u1', buildBody('Grace'));

      await expect(older).rejects.toBeInstanceOf(PreviewSupersededException);
      const result = await newer;
      expect(result).toEqual({ png: PNG, cached: false });
      // Only the newest request ever reached the compiler.
      expect(compiler.compilePreview).toHaveBeenCalledTimes(1);
      expect(compiler.compilePreview).toHaveBeenCalledWith('Hi {{fullName}}', {
        fullName: 'Grace',
      });
    });

    it('does not supersede previews belonging to different users', async () => {
      const a = service.renderUserBuild('u1', buildBody('Ada'));
      const b = service.renderUserBuild('u2', buildBody('Grace'));
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra).toEqual({ png: PNG, cached: false });
      expect(rb).toEqual({ png: PNG, cached: false });
      expect(compiler.compilePreview).toHaveBeenCalledTimes(2);
    });

    it.each([
      ['sandbox_unavailable', ServiceUnavailableException],
      ['compile_failed', UnprocessableEntityException],
      ['timeout', UnprocessableEntityException],
      ['no_output', UnprocessableEntityException],
    ] as const)(
      'maps a %s outcome to a generic HTTP error',
      async (reason, expected) => {
        compiler.compilePreview.mockResolvedValue({ ok: false, reason });
        await expect(
          service.renderUserBuild('u1', buildBody('Ada')),
        ).rejects.toBeInstanceOf(expected);
      },
    );

    it('does not cache a failed compile', async () => {
      compiler.compilePreview
        .mockResolvedValueOnce({ ok: false, reason: 'compile_failed' })
        .mockResolvedValueOnce({ ok: true, png: PNG });
      await expect(
        service.renderUserBuild('u1', buildBody('Ada')),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      const retry = await service.renderUserBuild('u1', buildBody('Ada'));
      expect(retry.cached).toBe(false);
      expect(compiler.compilePreview).toHaveBeenCalledTimes(2);
    });

    // The admin editor marks the offending line from `latexError`, so the
    // whitelisted summary has to reach the response body.
    it('returns the failing line and message as structured error data', async () => {
      compiler.compilePreview.mockResolvedValue({
        ok: false,
        reason: 'compile_failed',
        failure: { line: 12, message: 'Unknown LaTeX command.' },
      });

      const error = await service
        .renderUserBuild('u1', buildBody('Ada'))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as UnprocessableEntityException).getResponse()).toEqual(
        expect.objectContaining({
          message: 'Unknown LaTeX command.',
          latexError: { line: 12, message: 'Unknown LaTeX command.' },
        }),
      );
    });

    // The log itself must never ride along with the summary.
    it('never puts raw compiler output in the response', async () => {
      compiler.compilePreview.mockResolvedValue({
        ok: false,
        reason: 'compile_failed',
        failure: { message: 'The template could not be compiled.' },
      });

      const error = await service
        .renderUserBuild('u1', buildBody('Ada'))
        .catch((e: unknown) => e);
      const serialized = JSON.stringify(
        (error as UnprocessableEntityException).getResponse(),
      );
      expect(serialized).not.toContain('usr/share');
      expect(serialized).not.toContain('output.log');
    });
  });

  describe('renderAdminPreview', () => {
    it('renders the in-progress source against the shared sample data', async () => {
      const result = await service.renderAdminPreview('a1', 'Hi {{fullName}}');
      expect(compiler.compilePreview).toHaveBeenCalledWith('Hi {{fullName}}', {
        fullName: 'Ada Lovelace',
        headline: 'Senior Full-Stack Engineer',
        profile:
          'Full-stack engineer with 8 years building dependable web platforms. I care about clear APIs, fast feedback loops and shipping software that lasts.',
        email: 'ada.lovelace@example.com',
        phone: '+33 6 12 34 56 78',
        links: 'linkedin.com/in/adalovelace — github.com/adalovelace',
        experience:
          'Senior Engineer, Analytical Engines Ltd (2021 – Present)\nShipped a R&D platform used by 40+ teams.',
        education: 'MSc Mathematics, University of London (2015 – 2018)',
        certificates:
          'AWS Certified Solutions Architect (2023)\nCertified Kubernetes Administrator (2022)',
        skills: 'TypeScript, React, Node.js, PostgreSQL, Docker',
      });
      expect(result).toEqual({ png: PNG, cached: false });
    });

    it('caches by source text', async () => {
      await service.renderAdminPreview('a1', 'Hi {{fullName}}');
      const again = await service.renderAdminPreview('a1', 'Hi {{fullName}}');
      expect(again.cached).toBe(true);
      expect(compiler.compilePreview).toHaveBeenCalledTimes(1);
    });

    it('supersedes an in-flight preview for the same admin', async () => {
      const older = service.renderAdminPreview('a1', 'One {{fullName}}');
      const newer = service.renderAdminPreview('a1', 'Two {{fullName}}');
      await expect(older).rejects.toBeInstanceOf(PreviewSupersededException);
      await expect(newer).resolves.toEqual({ png: PNG, cached: false });
      expect(compiler.compilePreview).toHaveBeenCalledTimes(1);
    });
  });
});
