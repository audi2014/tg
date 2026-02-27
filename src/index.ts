import {Api, TelegramClient} from "telegram";
import {StringSession} from "telegram/sessions";
import prompts from "prompts";
import {GoogleGenAI} from "@google/genai";
import {GOOGLE_API_KEY, TG_API_HASH, TG_API_ID, TG_INVITE_HASH, TG_SESSION} from "./secrets";
import fs from 'node:fs'
import type {EntityLike} from "telegram/define";

const SESSION_FILE = 'tg-session.txt';
const readLocalSession = () => fs.existsSync(SESSION_FILE) ? fs.readFileSync(SESSION_FILE, 'utf8') : undefined;
const writeLocalSession = (txt: string) => fs.writeFileSync(SESSION_FILE, txt);

const resolvedSession = TG_SESSION || readLocalSession() || '';
const stringSession = new StringSession(resolvedSession);

const ai = new GoogleGenAI({
    apiKey: GOOGLE_API_KEY
});

async function summarizeChat(chatContext: string) {
    const prompt = "Ти помічник-аналітик. Твоє завдання — прочитати лог чату і зробити дуже стислий підсумок (3-10 пунктів) українською мовою. Виділи головні теми, домовленості або важливі анонси. Якщо в чаті просто флуд — так і напиши. Згкнкруй відповідь у вигляді дайджесту щоб учасники могли скіпнути непрочитані і бути в темі."
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `${prompt} ${chatContext}`,
    });
    return response.text;
}

async function retrieveChatEntity(client: TelegramClient) {
    const chatEntity: EntityLike = ((await client.invoke(
        new Api.messages.CheckChatInvite({
            hash: TG_INVITE_HASH,
        })
    )).toJSON() as any).chat;
    return chatEntity;
}

async function fetchMessages(client: TelegramClient, chatEntity: EntityLike) {

    const prevDayStart = new Date();
    prevDayStart.setDate(prevDayStart.getDate() - 1);
    prevDayStart.setHours(0, 0, 0, 0);


    const messages: Api.Message[] = [];

    // Iterates through messages using an async generator
    for await (const message of client.iterMessages(chatEntity)) {
        // message.date is a Unix timestamp (seconds since epoch)
        const messageDate = new Date(message.date * 1000);

        if (messageDate >= prevDayStart) {
            messages.push(message);
        } else {
            // Messages are returned in reverse chronological order (newest first)
            // so we can stop iterating once we hit yesterday's messages.
            break;
        }
    }
    return messages;
}

async function messageToString(msg: Api.Message) {
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
    return `[${date}] [${senderName}]: ${text}`;

}

async function init(client: TelegramClient) {
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
}

(async () => {
    const client = new TelegramClient(stringSession, TG_API_ID, TG_API_HASH, {
        connectionRetries: 5,
    });
    if (!resolvedSession) {
        await init(client);
        writeLocalSession(client.session.save() as unknown as string);
    } else {
        await client.connect();
    }
    const chatEntity = await retrieveChatEntity(client);
    const messages = await fetchMessages(client, chatEntity);
    const history = (await Promise.all(messages.map(messageToString))).reverse().join("\n")
    console.log(history);
    const digest = await summarizeChat(history);
    console.log(digest);
    await client.sendMessage('@x0057b8_ffd700', {
        message: `'[AI Arturchik] ${digest}'`
    })
    process.exit(0);
})();
