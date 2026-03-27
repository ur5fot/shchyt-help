interface HomeProps {
  onStart: (message?: string) => void;
}

const ПІДКАЗКИ = [
  'Чи маю я право на відпустку під час служби?',
  'Які виплати належать після поранення?',
  'Як отримати статус учасника бойових дій?',
  'Що робити якщо не виплачують грошове забезпечення?',
  'Чи можна оскаржити наказ командира?',
  'Які пільги мають члени сімей військовослужбовців?',
];

export default function Home({ onStart }: HomeProps) {
  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-12">
      <header className="text-center mb-10">
        <h1 className="text-5xl font-bold tracking-tight mb-2">Shchyt ⚖️</h1>
        <p className="text-gray-400 text-lg">
          AI-асистент з прав військовослужбовців ЗСУ
        </p>
      </header>

      <button
        onClick={() => onStart()}
        className="mb-10 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white text-lg font-semibold rounded-2xl transition-colors"
      >
        Задати питання
      </button>

      <section className="w-full max-w-xl mb-12">
        <p className="text-sm text-gray-500 uppercase tracking-wide mb-4 text-center">
          Типові питання
        </p>
        <ul className="flex flex-col gap-2">
          {ПІДКАЗКИ.map((підказка) => (
            <li key={підказка}>
              <button
                onClick={() => onStart(підказка)}
                className="w-full text-left px-4 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm transition-colors"
              >
                {підказка}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto text-center text-xs text-gray-600 max-w-md">
        ⚠️ Це не юридична консультація. Для прийняття рішень зверніться до
        військового адвоката.
      </footer>
    </div>
  );
}
