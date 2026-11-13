# دهبولوجي — الموقع

موقع ثابت مبني بـ Astro. الأسعار تُقرأ من لقطات مستودع `gold-board` (عنوانها في `src/lib/site.js`).

## التشغيل على الجهاز

```bash
npm install
npm run dev      # للتطوير، يفتح على عنوان محلي
npm test         # اختبارات الحسابات
npm run build    # يبني الموقع في مجلد dist
```

## الرفع

### 1) تجربة سريعة (بدون Git)

`npm run build` ثم ارفع مجلد `dist` كما هو على أي استضافة ملفات ثابتة (مثل Netlify Drop أو Cloudflare Pages).
هذا البناء «تجريبي»: فيه `noindex` فلا يظهر في جوجل، ومناسب للتجربة على الموبايل.

### 2) النشر الحقيقي على GitHub Pages

الموقع منشور على `https://ahmedmah1989.github.io/dahabology/` من فرع `gh-pages`.
لنشر أي تعديل، من مجلد المشروع:

```bash
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
```

السكربت يشغّل الاختبارات، يبني الموقع بعنوانه الحقيقي، ويرفع الناتج إلى `gh-pages`. لو فشل اختبار لا يُنشر شيء.
الكود نفسه في فرع `main` ويُرفع بـ `git push` كالعادة.

**نشر تلقائي (اختياري):** الملف `deploy/github-actions-deploy.yml` جاهز. لتفعيله انقله إلى
`.github/workflows/deploy.yml` واختر **Settings → Pages → Source → GitHub Actions**؛
رفعه يحتاج صلاحية `workflow` لحساب GitHub على الجهاز (`gh auth refresh --scopes workflow`).

للنشر على دومين خاص من استضافة أخرى، ابنِ بالعنوان الحقيقي:

```bash
SITE_URL=https://example.com BASE_PATH=/ npm run build
```

## أين أجد ماذا

| المسار | المحتوى |
|---|---|
| `src/pages/` | صفحة لكل عنوان. `index.astro` الشاشة الرئيسية |
| `src/panels/` | نصوص ومحتوى كل صفحة |
| `src/layouts/Base.astro` | الهيدر والتنقل وشريط الموبايل |
| `src/lib/site.js` | قائمة الصفحات وعنوان البيانات |
| `public/js/` | الحسابات: `monitor` الأسعار والفجوة، `board` المؤشر، `calc` الحاسبة، `tools` الفاتورة ودهبي وكارت المشاركة |
| `public/*.css` | الستايل. الإضافات الجديدة في `site.css` |
| `public/sw.js` | العمل بدون إنترنت |
| `tests/` | اختبارات الحسابات |
| `scripts/images.mjs` | توليد نسخ اللوجو الخفيفة من الصورة الأصلية |
