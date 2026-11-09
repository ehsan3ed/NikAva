
**English** · [فارسی](#farsi)

# Nikava open audio tools

Two small, self-contained modules taken out of [Nikava](https://pandenik.ir) — a mobile audio
studio for people who do not read music. They are published on their own so other developers can
use, test and improve them. The full Nikava app (recording engine, timeline, podcast mixer, vocal
tuning chain, mobile shell) stays private.

| Module | What it does | Demo |
| --- | --- | --- |
| [`hum2instrument`](hum2instrument/README.md) | Whistle or hum a tune → pitch tracking → detected key → notes → rendered instrument + WAV | [`hum2instrument/demo`](hum2instrument/demo/index.html) |
| [`score2sound`](score2sound/README.md) | Photo of printed sheet music → staff detection → noteheads → notes → rendered instrument + WAV | [`score2sound/demo`](score2sound/demo/index.html) |

Both are plain ES modules with **zero dependencies**. They run in the browser, in a Web Worker, in
a mobile WebView, and in Node (tests only need Node 18+).

## Why these two

Both modules answer the same question: *"I have music in my head or on paper, but I don't know
notes — how do I hear it as an instrument?"* The hard part for a beginner is not recording, it is
translating raw sound or printed symbols into something musical. That translation layer is what is
published here.

## Run the demos

```bash
git clone <this-repo> nikava-open-audio
cd nikava-open-audio
npx serve .          # or: python -m http.server 8080
```

Then open:

- `http://localhost:3000/hum2instrument/demo/`
- `http://localhost:3000/score2sound/demo/`

A static server is required (the demos use ES modules and, for the microphone, a secure
`localhost` origin).

## Tests

```bash
npm test          # runs both self-tests
npm run test:hum  # synthesise a hummed melody, detect it, render six instruments
npm run test:ocr  # draw a score, read it back, compare the notes
```

The tests are pure Node: no browser, no dependencies. They synthesise their own input, so they also
serve as executable documentation of the expected behaviour.

## Layout

```
hum2instrument/
  src/pitch.js       YIN pitch detection + note naming
  src/notes.js       pitch track → notes, key detection, key snapping
  src/instrument.js  six synthesised instruments (piano, e-piano, strings, flute, guitar, bass)
  src/wav.js         16-bit PCM WAV encoder
  src/index.js       humToInstrument(), analyzeHum(), decodeToMono()
  demo/index.html    record / upload → notes + playback
score2sound/
  src/vision.js      grayscale, Otsu threshold, staff lines, connected components
  src/score.js       staff grouping → notehead detection → pitch + duration → notes
  src/index.js       imageToNotes() + shared synthesiser
  demo/index.html    photo / sample score → notes + playback
```

## Contributing

Issues and pull requests are welcome, especially:

- better notehead detection (hollow notes, beams, accidentals printed on the page)
- tuplets and dotted rhythms in `score2sound`
- more instruments / better realism in `hum2instrument`
- non-Western scales for the key detector

Please keep the modules dependency-free and add a case to the matching `test/run.mjs` when you
change behaviour. Discussion happens in GitHub Issues.

## License

MIT — see [LICENSE](LICENSE).

---

<h2 id="farsi">فارسی</h2>

<div dir="rtl" align="right">

[English](#nikava-open-audio)

## ابزارهای صوتی متن‌باز نیکاوا

دو ماژول کوچک و مستقل که از [نیکاوا](https://pandenik.ir) جدا شده‌اند — یک استودیوی صوتی موبایل
برای کسانی که نت نمی‌خوانند. این ماژول‌ها به‌صورت مستقل منتشر شده‌اند تا سایر توسعه‌دهندگان بتوانند
از آن‌ها استفاده کنند، تست کنند و بهبود دهند. اپلیکیشن کامل نیکاوا (موتور ضبط، تایم‌لاین، میکسر
پادکست، زنجیره تنظیم صدای وکال، پوسته موبایل) خصوصی باقی می‌ماند.

| ماژول | چه می‌کند | دمو |
| --- | --- | --- |
| [`hum2instrument`](hum2instrument/README.md) | زمزمه یا سوت یک ملودی → ردیابی پیچ → تشخیص گام → نُت‌ها → ساز رندرشده + WAV | [`hum2instrument/demo`](hum2instrument/demo/index.html) |
| [`score2sound`](score2sound/README.md) | عکس نت چاپی → تشخیص خطوط حامل → سرنُت‌ها → نُت‌ها → ساز رندرشده + WAV | [`score2sound/demo`](score2sound/demo/index.html) |

هر دو ماژول‌های ES ساده با **صفر وابستگی** هستند. در مرورگر، در Web Worker، در WebView موبایل و در
Node اجرا می‌شوند (تست‌ها فقط به Node 18+ نیاز دارند).

### چرا این دو ماژول

هر دو ماژول به یک پرسش پاسخ می‌دهند: «موسیقی را در ذهنم یا روی کاغذ دارم، ولی نت نمی‌دانم — چطور
آن را به‌صورت ساز بشنوم؟» بخش سخت برای یک مبتدی ضبط کردن نیست، بلکه ترجمه صدای خام یا نمادهای
چاپی به چیزی موسیقایی است. همان لایه ترجمه است که اینجا منتشر شده.

### اجرای دموها

</div>

```bash
git clone <this-repo> nikava-open-audio
cd nikava-open-audio
npx serve .          # or: python -m http.server 8080
```

<div dir="rtl" align="right">

سپس باز کنید:

- `http://localhost:3000/hum2instrument/demo/`
- `http://localhost:3000/score2sound/demo/`

یک سرور استاتیک لازم است (دموها از ماژول‌های ES استفاده می‌کنند و برای میکروفون به مبدأ امن
`localhost` نیاز دارند).

### تست‌ها

</div>

```bash
npm test          # runs both self-tests
npm run test:hum  # synthesise a hummed melody, detect it, render six instruments
npm run test:ocr  # draw a score, read it back, compare the notes
```

<div dir="rtl" align="right">

تست‌ها کاملاً Node هستند: بدون مرورگر، بدون وابستگی. ورودی خودشان را سنتز می‌کنند، پس به‌عنوان
مستندات اجرایی رفتار مورد انتظار هم عمل می‌کنند.

### ساختار پروژه

</div>

```
hum2instrument/
  src/pitch.js       YIN pitch detection + note naming
  src/notes.js       pitch track → notes, key detection, key snapping
  src/instrument.js  six synthesised instruments (piano, e-piano, strings, flute, guitar, bass)
  src/wav.js         16-bit PCM WAV encoder
  src/index.js       humToInstrument(), analyzeHum(), decodeToMono()
  demo/index.html    record / upload → notes + playback
score2sound/
  src/vision.js      grayscale, Otsu threshold, staff lines, connected components
  src/score.js       staff grouping → notehead detection → pitch + duration → notes
  src/index.js       imageToNotes() + shared synthesiser
  demo/index.html    photo / sample score → notes + playback
```

<div dir="rtl" align="right">

### مشارکت

مسائل (Issues) و درخواست‌های pull پذیرفته می‌شوند، به‌ویژه:

- تشخیص بهتر سرنُت (نُت‌های توخالی، تیرها، علائم تغيير روی صفحه)
- سه‌تایی‌ها و ریتم‌های نقطه‌دار در `score2sound`
- سازهای بیشتر / واقع‌گرایی بهتر در `hum2instrument`
- گام‌های غیر غربی برای تشخیص‌دهنده گام

لطفاً ماژول‌ها را بدون وابستگی نگه دارید و وقتی رفتار را تغییر می‌دهید، یک مورد به `test/run.mjs`
متناظر اضافه کنید. بحث در GitHub Issues انجام می‌شود.

### مجوز

MIT — به [LICENSE](LICENSE) مراجعه کنید.

</div>