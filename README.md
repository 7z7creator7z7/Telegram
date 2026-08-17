# Telegram Zero — Messenger + Stars + Missions

Standalone Telegram-style web app. It does **not** connect to Telegram's private servers. It uses your own PostgreSQL database and can optionally use the official Telegram Bot API for channel membership checks and Telegram Stars payments.

## Added system

- Telegram-style dark mobile UI
- Stars balance and ledger
- `/balance` equivalent through the Stars screen/API: `GET /api/balance`
- Missions screen
- Default mission channel: `@Barcha_Kontent`
- Mission completion reward: configurable, **10 Stars by default**
- Mission creator pays `reward × max_people` Stars
- Example: 100 Stars budget + 2 Stars reward = 50 people; 200 + 2 = 100 people
- Mission disappears automatically after the participant limit is reached
- A user can complete each mission only once
- Referral system: **15 Stars** per referral
- Gifts: send a gift to another username and transfer its Stars value
- Premium: **500 Stars = 1 month**
- Telegram ID + username profile fields
- Telegram Bot `/start` response
- Telegram Stars invoice creation through Bot API
- Successful Telegram Stars payments are credited to the user's in-app Stars
- Bot/admin notifications for new users, payments, missions and completions
- Existing private chat, real-time Socket.IO messaging, edit/delete APIs
- PostgreSQL persistence
- Render + Docker deployment

## Important Telegram setup

Create a Telegram bot with BotFather and set:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ADMIN_CHAT_ID` (optional notification destination)
- `DEFAULT_CHANNEL=@Barcha_Kontent`

For mission verification, add the bot as an **administrator** of the target channel. The user must also save their numeric Telegram ID in Profile.

Set the Telegram webhook to:

`https://YOUR-RENDER-DOMAIN/api/telegram/webhook`

For example, use Telegram's `setWebhook` method with your bot token and this URL.

## Stars payment

The app creates a Telegram Stars invoice using currency `XTR`. The user pays in Telegram; the bot webhook receives `successful_payment` and credits the corresponding app account.

A real payment requires a real BotFather bot token and a working public HTTPS webhook.

## Deploy

1. Create a new GitHub repository.
2. Upload all files from this ZIP.
3. Render → New → Blueprint → select the repository.
4. Set `TELEGRAM_BOT_TOKEN`.
5. Optionally set `TELEGRAM_ADMIN_CHAT_ID`.
6. Deploy.
7. Configure the Telegram webhook.

## Notes

The app's Stars ledger is an internal application balance. It is not the same thing as Telegram's own account balance. Telegram Stars enter this app only through the configured bot payment flow.

Never commit a bot token or database password to GitHub.
