// react-markdown не рендерить raw HTML за замовчуванням — це безпечно.
// НЕ додавати rehype-raw без rehype-sanitize — це створить XSS-вразливість.
import Markdown from 'react-markdown';

export type MessageRole = 'user' | 'assistant';

interface MessageProps {
  role: MessageRole;
  text: string;
}

export default function Message({ role, text }: MessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        data-role={role}
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap'
            : 'bg-gray-800 rounded-bl-sm prose prose-invert prose-sm max-w-none [&>:first-child]:mt-0 [&>:last-child]:mb-0'
        }`}
      >
        {isUser ? (
          text
        ) : (
          <Markdown
            components={{
              a: ({ href, children }) => (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
            }}
          >
            {text}
          </Markdown>
        )}
      </div>
    </div>
  );
}
