import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { cvStructuredDataSchema, CvStructuredData } from './cv-schemas';

@Injectable()
export class CvAiParserService {
  constructor(private readonly ai: AiService) {}

  // The model is untrusted: completeJson Zod-validates the response before
  // it is stored, and the monthly cap is enforced by the caller (CvsService).
  parse(text: string): Promise<CvStructuredData> {
    return this.ai.completeJson(
      [
        {
          role: 'system',
          content:
            'You parse CV text into structured data. Reply with strict JSON only: ' +
            '{"fullName": string|null, "email": string|null, "phone": string|null, ' +
            '"links": string[], "experience": [{"text": string, "dateRange": string|null}], ' +
            '"education": [{"text": string, "dateRange": string|null}], "skills": string[]}. ' +
            'Never invent information that is not in the text.',
        },
        { role: 'user', content: text.slice(0, 30000) },
      ],
      cvStructuredDataSchema,
    );
  }
}
