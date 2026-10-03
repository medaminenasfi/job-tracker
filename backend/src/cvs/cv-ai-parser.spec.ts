import { describe, expect, it, jest } from '@jest/globals';
import { CvAiParserService } from './cv-ai-parser';
import { AiService } from '../ai/ai.service';

const completeJsonMock =
  jest.fn<
    (
      messages: { role: string; content: string }[],
      schema: { safeParse: (value: unknown) => { success: boolean } },
    ) => Promise<unknown>
  >();

describe('CvAiParserService', () => {
  it('sends the CV text through AiService with the shared schema', async () => {
    const structured = {
      fullName: 'Jane Doe',
      email: 'jane@email.com',
      experience: [{ text: 'Dev at Co', dateRange: '2021 - Present' }],
      education: [],
      skills: ['TypeScript'],
    };
    completeJsonMock.mockResolvedValue(structured);
    const ai = { completeJson: completeJsonMock } as unknown as AiService;
    const service = new CvAiParserService(ai);

    const result = await service.parse('raw cv text');

    expect(result).toEqual(structured);
    const [messages, schema] = completeJsonMock.mock.calls[0];
    expect(messages[0].role).toBe('system');
    expect(messages[1].content).toBe('raw cv text');
    // The shared Zod schema is what validates the model output.
    expect(schema.safeParse(structured).success).toBe(true);
    // Zod strips unknown keys, so a real type violation is needed here.
    expect(schema.safeParse({ experience: 'not-an-array' }).success).toBe(
      false,
    );
  });
});
