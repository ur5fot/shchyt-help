import { useState } from 'react';
import Home from './components/Home';
import Chat from './components/Chat';

type Screen = 'home' | 'chat';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [initialMessage, setInitialMessage] = useState<string>('');

  function handleStart(message?: string) {
    setInitialMessage(message ?? '');
    setScreen('chat');
  }

  function handleBack() {
    setScreen('home');
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {screen === 'home' ? (
        <Home onStart={handleStart} />
      ) : (
        <Chat initialMessage={initialMessage} onBack={handleBack} />
      )}
    </div>
  );
}
