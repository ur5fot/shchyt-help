// Заглушка — буде реалізовано в Task 8
interface ChatProps {
  initialMessage: string;
  onBack: () => void;
}

export default function Chat({ onBack }: ChatProps) {
  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-12">
      <button onClick={onBack} className="mb-6 text-gray-400 hover:text-gray-200">
        ← Назад
      </button>
      <p className="text-gray-500">Чат у розробці...</p>
    </div>
  );
}
