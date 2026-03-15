import asyncio
from aiogram import Bot, Dispatcher
from aiogram.types import Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from aiogram.filters import CommandStart

TOKEN = "8649503171:AAEhNWvycmnm8CtX0FgxF7lHsu5LJcNM1W0"
WEB_APP_URL = "https://niks222.github.io/dunk-rise/index.html?v=17"
bot = Bot(token=TOKEN)
dp = Dispatcher()


@dp.message(CommandStart())
async def start(message: Message) -> None:
    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="🏀 Play Dunk Rise",
                    web_app=WebAppInfo(url=WEB_APP_URL)
                )
            ]
        ]
    )

    await message.answer(
        "🏀 Dunk Rise\n\nБросай мяч в кольцо и поднимайся в рейтинге!",
        reply_markup=keyboard
    )


async def main() -> None:
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())