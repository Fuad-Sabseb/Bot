const TelegramBot = require("node-telegram-bot-api")
const fs = require("fs")
const path = require("path")

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TOKEN
const ADMIN_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ? Number(process.env.TELEGRAM_ADMIN_CHAT_ID) : 5999909651
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID ? Number(process.env.TELEGRAM_GROUP_CHAT_ID) : -1003847746028

const bot = new TelegramBot(TOKEN, { polling: true })

// =========================
// 📦 FILES
// =========================
const CAMPUS_FILE = "campus_id.txt"
const USED_FILE = "used_ids.txt"
const FEEDBACK_FILE = "feedback.txt"
const ASSIGNMENT_FOLDER = "assignments"
const INDIVIDUAL_FOLDER = path.join(ASSIGNMENT_FOLDER, "individual")
const GROUP_FOLDER = path.join(ASSIGNMENT_FOLDER, "group")

// =========================
// 🧠 STATE + DATABASE
// =========================
const userState = {}
const users = {}

if (!fs.existsSync(ASSIGNMENT_FOLDER)) fs.mkdirSync(ASSIGNMENT_FOLDER)
if (!fs.existsSync(INDIVIDUAL_FOLDER)) fs.mkdirSync(INDIVIDUAL_FOLDER)
if (!fs.existsSync(GROUP_FOLDER)) fs.mkdirSync(GROUP_FOLDER)

// =========================
// 📊 HELPERS
// =========================
function countAssignments() {
    if (!fs.existsSync(ASSIGNMENT_FOLDER)) return 0
    return fs.readdirSync(ASSIGNMENT_FOLDER, { recursive: true }).length
}

function campusExists(id) {
    if (!fs.existsSync(CAMPUS_FILE)) return false
    return fs.readFileSync(CAMPUS_FILE, "utf8").includes(id)
}

function campusUsed(id) {
    if (!fs.existsSync(USED_FILE)) return false
    return fs.readFileSync(USED_FILE, "utf8").includes(id)
}

function markCampusUsed(id) {
    fs.appendFileSync(USED_FILE, id + "\n")
}

async function createOneTimeInvite() {
    const invite = await bot.createChatInviteLink(GROUP_CHAT_ID, {
        member_limit: 1
    })
    return invite.invite_link
}

// =========================
// 🔙 BACK BUTTON
// =========================
const backButton = {
    inline_keyboard: [
        [{ text: "⬅️ Back to Menu", callback_data: "back_menu" }]
    ]
}

// =========================
// 🏠 MAIN MENU
// =========================
function sendMainMenu(chatId, messageId = null) {

    if (!users[chatId]) {
        users[chatId] = {
            role: "student",
            joinedAt: Date.now()
        }
    }

    const text = "🏠 *Campus Super App*"

    const menuButtons = [
        [
            { text: "🎓 Join Group", callback_data: "join_group" },
            { text: "📤 Assignment", callback_data: "assignment" }
        ],
        [
            { text: "📢 Important Announcement", callback_data: "announcement" },
            { text: "💬 Feedback", callback_data: "feedback" }
        ],
        [
            { text: "🧑‍💼 Admin", callback_data: "admin_panel" }
        ],
        [
            { text: "❓ Help", callback_data: "help" }
        ]
    ]

    const menu = {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: menuButtons
        }
    }

    if (messageId) {
        return bot.editMessageText(text, {
            chat_id: chatId,
            message_id: messageId,
            ...menu
        })
    }

    bot.sendMessage(chatId, text, menu)
    userState[chatId] = "menu"
}

// =========================
// ▶️ START
// =========================
bot.onText(/\/start/, (msg) => {
    sendMainMenu(msg.chat.id)
})

// =========================
// 🎮 CALLBACK HANDLER
// =========================
bot.on("callback_query", async (query) => {

    const chatId = query.message.chat.id
    const data = query.data
    const messageId = query.message.message_id

    bot.answerCallbackQuery(query.id)

    if (data === "back_menu") return sendMainMenu(chatId, messageId)

    // =========================
    // 🎓 JOIN GROUP
    // =========================
    if (data === "join_group") {
        userState[chatId] = "join_waiting_id"
        return bot.editMessageText("🎓 Send your Campus ID:", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: backButton
        })
    }

    // =========================
    // 📤 ASSIGNMENT MENU (NEW)
    // =========================
    if (data === "assignment") {
        return bot.editMessageText("📤 Choose Assignment Type:", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📄 Submit Individual", callback_data: "assignment_individual" }],
                    [{ text: "👥 Submit Group", callback_data: "assignment_group" }],
                    [{ text: "⬅️ Back", callback_data: "back_menu" }]
                ]
            }
        })
    }

    if (data === "assignment_individual") {
        userState[chatId] = "assignment_individual"
        return bot.sendMessage(chatId, "📄 Upload your INDIVIDUAL assignment file:")
    }

    if (data === "assignment_group") {
        userState[chatId] = "assignment_group"
        return bot.sendMessage(chatId, "👥 Upload your GROUP assignment file:")
    }

    // =========================
    // 📢 IMPORTANT ANNOUNCEMENT
    // =========================
    if (data === "announcement") {
        userState[chatId] = "announcement_waiting_text"
        return bot.editMessageText("📢 Type your important announcement:", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: backButton
        })
    }

    // =========================
    // 💬 FEEDBACK
    // =========================
    if (data === "feedback") {
        userState[chatId] = "feedback_waiting_text"
        return bot.editMessageText("💬 Type your feedback:", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: backButton
        })
    }

    // =========================
    // 🧑‍💼 ADMIN PANEL (ONLY ADMIN)
    // =========================
    if (data === "admin_panel") {

        if (chatId !== ADMIN_ID) {
            return bot.sendMessage(chatId, "❌ Access denied")
        }

        return bot.editMessageText("🧑‍💼 Admin Dashboard", {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "📊 Stats", callback_data: "admin_stats" },
                        { text: "👥 Users", callback_data: "admin_users" }
                    ],
                    [
                        { text: "📤 Assignments", callback_data: "admin_assignments" },
                        { text: "💬 Feedback", callback_data: "admin_feedback" }
                    ],
                    [{ text: "⬅️ Back", callback_data: "back_menu" }]
                ]
            }
        })
    }

    // =========================
    // 📊 STATS
    // =========================
    if (data === "admin_stats") {
        return bot.editMessageText(
`📊 Stats
👥 Users: ${Object.keys(users).length}
📤 Assignments: ${countAssignments()}`,
            {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: backButton
            }
        )
    }

    // =========================
    // 👥 USERS LIST
    // =========================
    if (data === "admin_users") {
        return bot.sendMessage(chatId,
            "👥 Users:\n" + Object.keys(users).join("\n")
        )
    }

    // =========================
    // 📤 ADMIN ASSIGNMENTS
    // =========================
    if (data === "admin_assignments") {
        return bot.sendMessage(chatId, "📤 Choose type:", {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "📄 Individual", callback_data: "admin_individual_list" }],
                    [{ text: "👥 Group", callback_data: "admin_group_list" }]
                ]
            }
        })
    }

    if (data === "admin_individual_list") {
        const files = fs.readdirSync(INDIVIDUAL_FOLDER)
        files.forEach(file => {
            bot.sendDocument(chatId, fs.createReadStream(path.join(INDIVIDUAL_FOLDER, file)))
        })
    }

    if (data === "admin_group_list") {
        const files = fs.readdirSync(GROUP_FOLDER)
        files.forEach(file => {
            bot.sendDocument(chatId, fs.createReadStream(path.join(GROUP_FOLDER, file)))
        })
    }

    // =========================
    // 💬 ADMIN FEEDBACK
    // =========================
    if (data === "admin_feedback") {
        const data = fs.existsSync(FEEDBACK_FILE)
            ? fs.readFileSync(FEEDBACK_FILE, "utf8")
            : "No feedback yet"

        return bot.sendMessage(chatId, "💬 Feedbacks:\n\n" + data)
    }

    // =========================
    // ❓ HELP
    // =========================
    if (data === "help") {
        return bot.editMessageText(
`❓ Help
🎓 Join → Campus ID
📤 Assignment → Upload file
📢 Announcement → Broadcast message
💬 Feedback → Message`,
            {
                chat_id: chatId,
                message_id: messageId,
                reply_markup: backButton
            }
        )
    }
})

// =========================
// 💬 MESSAGE HANDLER
// =========================
bot.on("message", async (msg) => {

    const chatId = msg.chat.id
    const text = msg.text
    if (!text && !msg.document) return

    const state = userState[chatId]

    // =========================
    // 🎓 JOIN
    // =========================
    if (state === "join_waiting_id") {

        if (!campusExists(text)) return bot.sendMessage(chatId, "❌ Invalid ID")

        if (campusUsed(text)) return bot.sendMessage(chatId, "❌ Already used")

        markCampusUsed(text)

        const link = await createOneTimeInvite()
        bot.sendMessage(chatId, `🎓 Join Link:\n${link}`)

        delete userState[chatId]
        return sendMainMenu(chatId)
    }

    // =========================
    // 💬 FEEDBACK
    // =========================
    if (state === "feedback_waiting_text") {

        fs.appendFileSync(FEEDBACK_FILE, `User ${chatId}: ${text}\n`)
        bot.sendMessage(chatId, "✅ Saved!")
        bot.sendMessage(ADMIN_ID, `💬 Feedback:\n${text}`)

        delete userState[chatId]
        return sendMainMenu(chatId)
    }

    // =========================
    // 📢 ANNOUNCEMENT (NEW)
    // =========================
    if (state === "announcement_waiting_text") {

        Object.keys(users).forEach(id => {
            bot.sendMessage(id, `📢 Important Announcement:\n\n${text}`)
        })

        bot.sendMessage(chatId, "📢 Broadcast sent!")

        delete userState[chatId]
        return sendMainMenu(chatId)
    }

    // =========================
    // 🏠 AUTO MENU
    // =========================
    if (!state && !msg.document) return sendMainMenu(chatId)
})

// =========================
// 📤 ASSIGNMENTS UPLOAD (UPDATED)
// =========================
bot.on("document", async (msg) => {

    const chatId = msg.chat.id
    const state = userState[chatId]
    if (!msg.document) return

    const fileId = msg.document.file_id
    const fileName = msg.document.file_name

    let targetFolder = null

    if (state === "assignment_individual") targetFolder = INDIVIDUAL_FOLDER
    if (state === "assignment_group") targetFolder = GROUP_FOLDER

    if (!targetFolder) return

    try {
        const tempPath = await bot.downloadFile(fileId, targetFolder)
        const newPath = path.join(targetFolder, fileName)

        fs.renameSync(tempPath, newPath)

        bot.sendMessage(chatId, "✅ Uploaded!")
        delete userState[chatId]
        sendMainMenu(chatId)

    } catch (err) {
        bot.sendMessage(chatId, "❌ Upload failed")
    }
})

console.log("🚀 CAMPUS SUPER APP RUNNING")