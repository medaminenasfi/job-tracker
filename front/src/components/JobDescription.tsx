'use client';

import DOMPurify from 'dompurify';

interface JobDescriptionProps {
  value?: string | null;
}

const SAFE_TAGS = [
  'a', 'b', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'hr', 'i', 'li',
  'ol', 'p', 'pre', 'strong', 'u', 'ul',
];

function hasMarkup(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function JobDescription({ value }: JobDescriptionProps) {
  const description = value?.trim();

  if (!description || description === '<p></p>') {
    return <p className="text-sm text-muted-foreground">No description available.</p>;
  }

  if (!hasMarkup(description)) {
    return <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{description}</p>;
  }

  const sanitized = DOMPurify.sanitize(description, {
    ALLOWED_TAGS: SAFE_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    FORBID_TAGS: ['embed', 'iframe', 'object', 'script', 'style'],
  });

  return (
    <div
      className="job-description-content break-words text-sm leading-7 text-foreground"
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}