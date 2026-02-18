import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import prompts from "prompts";
import { GoogleGenAI } from "@google/genai";
import {googleApiKey, tgApiHash, tgApiId, tgInviteHash} from "./secrets";
import fs from 'node:fs'

const SESSION_FILE = 'tg-session.txt';
const reedTgSession = () => fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8') : undefined;
const writeTgSession = (txt:string) => fs.writeFileSync(SESSION_FILE, txt);

const stringSession = new StringSession(reedTgSession());

const ai = new GoogleGenAI({
    apiKey: googleApiKey
});

async function summarizeChat(chatContext: string) {
    console.log(chatContext);

    const prompt = "Ти помічник-аналітик. Твоє завдання — прочитати лог чату і зробити дуже стислий підсумок (3-5 пунктів) українською мовою. Виділи головні теми, домовленості або важливі анонси. Якщо в чаті просто флуд — так і напиши."
    const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `${prompt} ${chatContext}`,
    });
    console.log(response.text);
}

(async () => {
    const client = new TelegramClient(stringSession, tgApiId, tgApiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => {
            const res = await prompts({
                type: 'text',
                name: 'value',
                message: 'Введіть номер телефону (+380...):'
            });
            return res.value;
        },
        phoneCode: async () => {
            const res = await prompts({
                type: 'text',
                name: 'value',
                message: 'Введіть код підтвердження:'
            });
            return res.value;
        },
        password: async () => {
            const res = await prompts({
                type: 'password',
                name: 'value',
                message: 'Введіть 2FA пароль (якщо є):'
            });
            return res.value;
        },
        onError: (err) => console.error("Помилка авторизації:", err.message),
    });

    writeTgSession(client.session.save() as unknown as string);


    const groupId = ((await client.invoke(
        new Api.messages.CheckChatInvite({
            hash: tgInviteHash,
        })
    )).toJSON() as any).chat.id.toString();

    // Отримання повідомлень
    const messages = await client.getMessages(groupId, {
        limit: 10,
    });


    const history: string[] = [];

    for (const msg of messages.reverse()) {
        const date = new Date(msg.date * 1000).toJSON();
        // Метод getSender() — це зручний спосіб у GramJS
        // отримати об'єкт автора (User або Channel)
        const sender = await msg.getSender() as Api.User | Api.Channel;

        let senderName = "Невідомий";

        if (sender instanceof Api.User) {
            // Для користувачів збираємо ім'я та прізвище
            senderName = [sender.firstName, sender.lastName].filter(Boolean).join(" ");
        } else if (sender instanceof Api.Channel) {
            // Якщо це повідомлення від імені групи/каналу
            senderName = sender.title;
        }

        const text = msg.message || "<Медіа або порожньо>";
        const line = `[${date}] [${senderName}]: ${text}`;
        history.push(line)
    }

    const formattedMessages = (history.join("\n"));


    summarizeChat(formattedMessages);



})();
