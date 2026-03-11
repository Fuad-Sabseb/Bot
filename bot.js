const TelegramBot = require('node-telegram-bot-api')
const fs = require('fs')

const TOKEN = "8371548092:AAEzNVOANHEsLdgUyEZdFmvSkrf4d-OPPVc"
const ADMIN_ID = 5999909651

const bot = new TelegramBot(TOKEN, { polling: true })

const FILE = "students.txt"

const users = {}

function initFile() {
    if (!fs.existsSync(FILE)) {
        fs.writeFileSync(FILE, "First Name\tLast Name\tEmail\n")
    }
}

function emailValid(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return regex.test(email)
}

function emailExists(email) {
    const data = fs.readFileSync(FILE, "utf8")
    return data.toLowerCase().includes(email.toLowerCase())
}

function countStudents() {
    const lines = fs.readFileSync(FILE, "utf8").trim().split("\n")
    return lines.length - 1
}

initFile()

bot.onText(/\/start/, (msg) => {

    const id = msg.chat.id

    users[id] = { step: 1 }

    bot.sendMessage(id, "Welcome!\nEnter First Name:")
})

bot.on("message", (msg) => {

    const id = msg.chat.id

    if (!users[id]) return

    const step = users[id].step
    const text = msg.text

    if (text.startsWith("/")) return

    if (step === 1) {

        users[id].first = text
        users[id].step = 2

        bot.sendMessage(id, "Enter Last Name:")

    } else if (step === 2) {

        users[id].last = text
        users[id].step = 3

        bot.sendMessage(id, "Enter Email:")

    } else if (step === 3) {

        if (!emailValid(text)) {
            bot.sendMessage(id, "Invalid email. Try again:")
            return
        }

        if (emailExists(text)) {
            bot.sendMessage(id, "Email already registered.")
            delete users[id]
            return
        }

        const first = users[id].first
        const last = users[id].last
        const email = text

        const line = `${first}\t${last}\t${email}\n`

        fs.appendFileSync(FILE, line)

        bot.sendMessage(id, "Registration successful!")

        delete users[id]
    }

})

bot.onText(/\/total/, (msg) => {

    const total = countStudents()

    bot.sendMessage(msg.chat.id, `Total students: ${total}`)
})

bot.onText(/\/download/, (msg) => {

    if (msg.chat.id !== ADMIN_ID) {
        bot.sendMessage(msg.chat.id, "Admin only command.")
        return
    }

    bot.sendDocument(msg.chat.id, FILE)
})

bot.onText(/\/cancel/, (msg) => {

    delete users[msg.chat.id]

    bot.sendMessage(msg.chat.id, "Registration cancelled.")
})

console.log("Bot running...")