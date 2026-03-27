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
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-gray-800 text-gray-100 rounded-bl-sm'
        }`}
      >
        {text}
      </div>
    </div>
  );
}
