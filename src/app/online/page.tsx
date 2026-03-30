import { Header } from "@/components/layout/Header";

export default function OnlinePage() {
  return (
    <div className="min-h-screen bg-[#F5F4F1]">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-20 flex flex-col items-center text-center">
        {/* Glowing bike icon */}
        <div className="relative mb-10">
          <div
            className="w-28 h-28 rounded-3xl flex items-center justify-center text-5xl"
            style={{
              background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)",
              boxShadow: "0 0 60px rgba(124, 92, 252, 0.4), 0 0 30px rgba(11, 191, 181, 0.3)",
            }}
          >
            🚴‍♀️
          </div>
          {/* Pulse rings */}
          <div
            className="absolute inset-0 rounded-3xl animate-ping opacity-20"
            style={{ background: "linear-gradient(135deg, #0BBFB5 0%, #7C5CFC 100%)" }}
          />
        </div>

        {/* Headline */}
        <h1 className="text-3xl font-extrabold text-[#1C1C1E] mb-3 leading-tight">
          Велосипедисты онлайн
        </h1>
        <p className="text-sm font-semibold tracking-widest uppercase mb-8"
          style={{ color: "#7C5CFC" }}>
          однажды мы встретимся в мобильном приложении
        </p>

        {/* Cards with features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-10">
          {[
            { icon: "📍", title: "Кто едет рядом", text: "Смотри, где катаются другие велосипедисты и какие маршруты они выбирают" },
            { icon: "🤝", title: "Присоединяйся к покатушкам", text: "Находи маршруты рядом и присоединяйся прямо сейчас" },
            { icon: "🚨", title: "SOS, если нужна помощь", text: "Отправь сигнал — и велосипедисты поблизости узнают, что тебе нужна помощь" },
          ].map(({ icon, title, text }) => (
            <div
              key={icon}
              className="bg-white rounded-2xl p-5 border border-[#E4E4E7] text-left"
              style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
            >
              <div className="text-2xl mb-3">{icon}</div>
              <p className="text-sm font-semibold text-[#1C1C1E] mb-1">{title}</p>
              <p className="text-sm text-[#71717A] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        {/* Main description */}
        <div
          className="bg-white rounded-2xl p-8 border border-[#E4E4E7] text-left w-full mb-8"
          style={{ boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.07)" }}
        >
          <p className="text-[#1C1C1E] leading-relaxed mb-4">
            В мобильном приложении ты сможешь видеть, где катаются другие велосипедисты,
            отслеживать маршруты и находить компанию прямо во время поездки.
          </p>
          <p className="text-[#1C1C1E] leading-relaxed mb-4">
            Хочешь поехать не один? Просто присоединяйся к ближайшей поездке или велоклубу.
          </p>
          <p className="text-[#1C1C1E] leading-relaxed mb-4">
            Нужна помощь — нажми SOS, и велосипедисты рядом получат сигнал.
          </p>
          <p className="text-[#1C1C1E] leading-relaxed mb-4">
            CycleConnect — место, где поездки становятся живыми, а маршруты объединяют людей 🚴‍♀️
          </p>
          <p className="text-[#A1A1AA] text-sm">Пока ты просто читаешь этот текст. Но скоро всё оживёт 😉</p>
        </div>

        {/* Decorative map dots */}
        <div className="flex items-center gap-2 opacity-40">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: i === 3 ? 10 : 6,
                height: i === 3 ? 10 : 6,
                backgroundColor: i % 2 === 0 ? "#7C5CFC" : "#0BBFB5",
              }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
