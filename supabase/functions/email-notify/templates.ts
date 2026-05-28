/**
 * Email templates — inlined as TypeScript string constants.
 *
 * Supabase edge-runtime compiles only index.ts to a temp dir; it does NOT
 * copy subdirectories. Using Deno.readTextFile("./templates/…") therefore
 * fails at runtime. Keeping templates as a regular TS import solves this
 * while preserving the clean variable-substitution pattern.
 *
 * Variables are {{UPPER_SNAKE_CASE}} placeholders replaced by fillTemplate().
 */

export const TEMPLATES = new Map<string, string>([

  ["_base", `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{PAGE_TITLE}}</title>
</head>
<body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#1C1C1E;">Cycle</span><span style="font-size:20px;font-weight:700;color:#F4632A;">Connect</span>
        </td></tr>
        <tr><td style="background:#fff;border-radius:20px;border:1px solid #E4E4E7;padding:32px;">
          {{BODY}}
        </td></tr>
        <tr><td align="center" style="padding-top:16px;font-size:12px;color:#A1A1AA;">
          CycleConnect — сообщество велоспорта
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`],

  ["event-cancelled", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
  Поездку отменили
</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{GREETING}}
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 20px;">
  <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.6;">
    📅 <b>{{TITLE}}</b><br/>
    {{DATE_ROW}}{{MEET_POINT_ROW}}👤 Организатор: {{ORGANIZER_NAME}}
  </td></tr>
</table>
{{REASON_BLOCK}}
<p style="font-size:14px;line-height:1.5;color:#71717A;margin:0 0 24px;">
  Если хочется покатать всё равно — посмотри, что есть рядом.
</p>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{EVENTS_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Найти поездки рядом
    </a>
  </td></tr>
</table>
<p style="font-size:12px;line-height:1.5;color:#A1A1AA;margin:24px 0 0;">
  Это письмо нельзя отключить — оно про твои планы.
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить остальные уведомления →</a>
</p>`],

  ["event-rescheduled", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">Поездка перенесена</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{GREETING}}
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 24px;">
  <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.8;">
    📅 <b>{{TITLE}}</b><br/>
    ❌ <span style="text-decoration:line-through;color:#A1A1AA;">Было: {{OLD_DATE}}</span><br/>
    ✅ Стало: <b>{{NEW_DATE}}</b><br/>
    {{MEET_POINT_ROW}}👤 Организатор: {{ORGANIZER_NAME}}
  </td></tr>
</table>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{EVENT_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Открыть поездку
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["event-rsvp-confirmation", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">Готово — до встречи!</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{LEAD_TEXT}}
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 24px;">
  <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.8;">
    📅 <b>{{TITLE}}</b><br/>
    {{DATE_ROW}}{{MEET_POINT_ROW}}👤 Организатор: {{ORGANIZER_NAME}}<br/>
    👥 Уже едут: {{PARTICIPANTS_COUNT}}
  </td></tr>
</table>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{EVENT_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Открыть поездку
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["event-new-rsvp", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
  Новый участник 🎉
</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{LEAD_TEXT}}
</p>
<p style="font-size:14px;color:#71717A;margin:0 0 24px;">
  Сейчас участников: <b>{{PARTICIPANTS_COUNT}}</b>
</p>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{EVENT_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Список участников →
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["announcement", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 8px;">
  {{HEADING}}
</h1>
<p style="font-size:13px;color:#A1A1AA;margin:0 0 20px;">{{EVENT_TITLE}}</p>
<div style="font-size:15px;line-height:1.6;color:#3F3F46;white-space:pre-line;margin:0 0 24px;">
  {{MESSAGE_TEXT}}
</div>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{EVENT_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Открыть поездку
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["club-join-request", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">Новая заявка</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{LEAD_TEXT}}
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 24px;">
  <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.8;">
    👤 <b>{{APPLICANT_NAME}}</b><br/>
    🚴 {{KM_TOTAL}} км накатано<br/>
    📅 На сервисе с {{MEMBER_SINCE}}
  </td></tr>
</table>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{CLUB_MEMBERS_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Открыть заявки →
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["club-join-approved", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
  Добро пожаловать в «{{CLUB_NAME}}»! 🎉
</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 24px;">
  {{LEAD_TEXT}}
</p>
<p style="font-size:14px;color:#71717A;margin:0 0 24px;">
  Загляни в клуб: посмотри календарь поездок и закреплённые маршруты.
</p>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{CLUB_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Открыть клуб →
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["club-join-rejected", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
  Заявку не одобрили
</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 24px;">
  К сожалению, владелец клуба «{{CLUB_NAME}}» не принял твою заявку. Это
  бывает — клуб мог быть закрыт по другим причинам.
</p>
<p style="font-size:14px;color:#71717A;margin:0 0 24px;">
  Рядом есть другие клубы — возможно, там найдёшь компанию для катания.
</p>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{CLUBS_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Найти клуб →
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["event-hour-reminder", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">🔔 Через час старт!</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{LEAD_TEXT}}
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 24px;">
  <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.8;">
    📅 <b>{{TITLE}}</b><br/>
    🗓 {{DATE_STR}}<br/>
    {{MEET_POINT_ROW}}👤 Организатор: {{ORGANIZER_NAME}}
  </td></tr>
</table>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{EVENT_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Открыть поездку →
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["event-post-report", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">Расскажи, как прошло 🚴</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{LEAD_TEXT}}
</p>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{REPORT_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Написать отчёт →
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  Это последнее напоминание по этой поездке.<br/>
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

  ["route-report-for-interest", `<h1 style="font-size:22px;line-height:1.3;color:#1C1C1E;margin:0 0 16px;">
  Кто-то прокатал твой маршрут 🚴
</h1>
<p style="font-size:15px;line-height:1.5;color:#3F3F46;margin:0 0 20px;">
  {{LEAD_TEXT}}
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F4F1;border-radius:12px;padding:16px;margin:0 0 20px;">
  <tr><td style="font-size:14px;color:#1C1C1E;line-height:1.6;">
    🗺 <b>{{ROUTE_TITLE}}</b><br/>
    👤 {{ACTOR_NAME}}, {{RIDDEN_AT}}<br/>
    {{VIBE_ROW}}{{EXCERPT_ROW}}
  </td></tr>
</table>
<table cellpadding="0" cellspacing="0">
  <tr><td style="background:#F4632A;border-radius:10px;">
    <a href="{{REPORT_URL}}" style="display:inline-block;padding:12px 24px;color:#fff;font-size:15px;font-weight:600;text-decoration:none;">
      Читать отчёт →
    </a>
  </td></tr>
</table>
<p style="font-size:12px;color:#A1A1AA;margin:24px 0 0;">
  Шлём не чаще одного письма в сутки на маршрут.<br/>
  <a href="{{SETTINGS_URL}}" style="color:#F4632A;text-decoration:none;">Настроить уведомления →</a>
</p>`],

]);
