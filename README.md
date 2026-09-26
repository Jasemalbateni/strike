# STRIKE — بوابة الفريق

البوابة الداخلية لفريق أكاديمية سترايك. للموظفين المصرّح لهم فقط.

**الوحدة الأولى: مركز التسويق** — الأهداف، خطة التسويق، العصف الذهني، تقويم المحتوى، سير العمل (Kanban)، ومتابعة الأرقام. كل تغيير يظهر للكل باللحظة (Supabase Realtime + Presence).

## التقنيات

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Supabase (Auth + Postgres + Realtime) — مشروع `Strike Platform`
- `@dnd-kit` للسحب والإفلات

## التشغيل محلياً

```bash
npm install
cp .env.example .env.local   # ثم ضع مفتاح Supabase الـ publishable
npm run dev
```

المتغيرات المطلوبة:

| المتغير | الوصف |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | رابط مشروع Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | المفتاح العام (publishable / anon) |

لا يحتاج المشروع مفتاح service role: إدارة الحسابات تتم عبر دوال SQL محمية (المالك فقط).

## النشر على Vercel

1. Import الريبو في Vercel.
2. أضف المتغيرين أعلاه في Environment Variables.
3. Deploy. أضف رابط النشر في Supabase → Authentication → URL Configuration (Site URL).

## الحسابات والصلاحيات

- تسجيل الدخول باسم مستخدم وكلمة مرور فقط (لا تسجيل ذاتي).
- المالك ينشئ الحسابات من صفحة **الفريق** ويحدد الدور (مالك / مدير فرع / إداري / مدرب) وصلاحية **مركز التسويق**.
- لا أحد يرى دور أو صلاحيات غيره؛ صفحة الفريق للمالك فقط.
- تغيير كلمة المرور من **الإعدادات**.

## قاعدة البيانات (Supabase)

الجداول: `profiles`, `mk_goals`, `mk_plan_items`, `mk_ideas`, `mk_posts`, `mk_metrics`, `mk_activity`.
كل جداول `mk_*` محمية بـ RLS: يقرأها ويعدلها فقط من لديه `marketing_access` (والمالك دائماً).
سجل النشاط `mk_activity` يُملأ تلقائياً بـ triggers.

الدوال الإدارية (المالك فقط): `admin_create_user`, `admin_set_password`, `admin_delete_user`.

## هيكل الكود

```
src/
  proxy.ts                     # تجديد الجلسة + حماية الصفحات
  lib/supabase/{client,server} # عملاء Supabase
  lib/auth.ts                  # getProfile / canAccessMarketing
  lib/types.ts                 # الأنواع والتسميات العربية
  app/login                    # تسجيل الدخول
  app/(portal)/                # الصفحات المحمية: الرئيسية، marketing، team، settings
  components/shell.tsx         # القائمة الجانبية / السفلية
  components/marketing/        # مركز التسويق: store (realtime) + التبويبات
```
