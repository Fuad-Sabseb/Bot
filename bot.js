const TelegramBot = require("node-telegram-bot-api")
const fs = require("fs")
const path = require("path")
const archiver = require("archiver")

const TOKEN = process.env.TOKEN || "YOUR_BOT_TOKEN"
const ADMIN_ID = 5999909651

// ADD YOUR TELEGRAM GROUP ID HERE
const GROUP_CHAT_ID = -1003847746028
const bot = new TelegramBot(TOKEN, { polling: true })

const CAMPUS_FILE = "campus_id.txt"
const USED_FILE = "used_ids.txt"
const FEEDBACK_FILE = "feedback.txt"
const ASSIGNMENT_FOLDER = "assignments"

const campusJoin = {}
const assignmentUsers = {}
const feedbackUsers = {}

if (!fs.existsSync(ASSIGNMENT_FOLDER)) fs.mkdirSync(ASSIGNMENT_FOLDER)

function mainMenu(chatId) {

    const menu = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "🎓 Join Group", callback_data: "join_group" },
                    { text: "📤 Submit Assignment", callback_data: "submit_assignment" }
                ],
                [
                    { text: "💬 Feedback", callback_data: "feedback" },
                    { text: "❓ Help", callback_data: "help" }
                ]
            ]
        }
    }

    bot.sendMessage(chatId, "📚 *Assignment Management Bot*\nChoose an option:", {
        parse_mode: "Markdown",
        ...menu
    })
}

bot.onText(/\/start/, (msg) => {

    const chatId = msg.chat.id

    bot.sendMessage(chatId, "Welcome!")

    mainMenu(chatId)

})

bot.on("callback_query", (query) => {

    const chatId = query.message.chat.id
    const data = query.data

    if (data === "join_group") {

        campusJoin[chatId] = true
        bot.sendMessage(chatId, "Enter your Campus ID:")

    }

    else if (data === "submit_assignment") {

        assignmentUsers[chatId] = true
        bot.sendMessage(chatId, "Upload your assignment file.")

    }

    else if (data === "feedback") {

        feedbackUsers[chatId] = true
        bot.sendMessage(chatId, "Send your feedback.")

    }

    else if (data === "help") {

        bot.sendMessage(chatId,
`Available Options

🎓 Join Group → Verify Campus ID
📤 Submit Assignment → Upload assignment file
💬 Feedback → Send feedback to admin
`)
    }

})

function campusExists(id) {

    const data = fs.readFileSync(CAMPUS_FILE, "utf8")
    return data.includes(id)

}

function campusUsed(id) {

    if (!fs.existsSync(USED_FILE)) return false

    const data = fs.readFileSync(USED_FILE, "utf8")
    return data.includes(id)

}

function markCampusUsed(id) {

    fs.appendFileSync(USED_FILE, id + "\n")

}

// NEW FUNCTION: CREATE ONE-TIME INVITE LINK
async function createOneTimeInvite() {

    const invite = await bot.createChatInviteLink(GROUP_CHAT_ID, {
        member_limit: 1
    })

    return invite.invite_link
}

bot.on("message", async (msg) => {

    const chatId = msg.chat.id
    const text = msg.text

    if (!text) return

    // JOIN GROUP SYSTEM
    if (campusJoin[chatId]) {

        if (!campusExists(text)) {

            bot.sendMessage(chatId, "❌ Campus ID not found.")

        }

        else if (campusUsed(text)) {

            bot.sendMessage(chatId, "❌ This Campus ID already used.")

        }

        else {

            markCampusUsed(text)

            const inviteLink = await createOneTimeInvite()

            bot.sendMessage(chatId,
`✅ Campus ID Verified!

🎓 Your private join link:
${inviteLink}

⚠️ This link can be used only once.`)

        }

        delete campusJoin[chatId]

    }

    // FEEDBACK SYSTEM
    else if (feedbackUsers[chatId]) {

        fs.appendFileSync(FEEDBACK_FILE, `User ${chatId}: ${text}\n`)

        bot.sendMessage(chatId, "✅ Feedback received. Thank you!")

        delete feedbackUsers[chatId]

    }

})

// ASSIGNMENT UPLOAD
bot.on("document", (msg) => {

    const chatId = msg.chat.id

    if (!assignmentUsers[chatId]) return

    const fileId = msg.document.file_id

    bot.downloadFile(fileId, ASSIGNMENT_FOLDER)
        .then(() => {

            bot.sendMessage(chatId, "✅ Assignment submitted successfully!")

            delete assignmentUsers[chatId]

        })

})

// ADMIN: DOWNLOAD ASSIGNMENTS ZIP
bot.onText(/\/download_assignments/, (msg) => {

    if (msg.chat.id !== ADMIN_ID) {

        bot.sendMessage(msg.chat.id, "Admin only command.")
        return
    }

    const zip = "assignments.zip"

    const output = fs.createWriteStream(zip)
    const archive = archiver("zip")

    archive.pipe(output)

    archive.directory(ASSIGNMENT_FOLDER, false)

    archive.finalize()

    output.on("close", () => {

        bot.sendDocument(msg.chat.id, zip)

    })

})

// ADMIN: DOWNLOAD FEEDBACK
bot.onText(/\/download_feedback/, (msg) => {

    if (msg.chat.id !== ADMIN_ID) return

    bot.sendDocument(msg.chat.id, FEEDBACK_FILE)

})

console.log("🚀 Professional Assignment Bot Running")