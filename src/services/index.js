const axios = require('axios');
const dotenv = require('dotenv')

dotenv.config()

const LOCALHOST = "http://localhost:3000/precedent"
const PRODSERVER = "https://law-bot.me/precedent"

const supremeCourtApi = axios.create({
  baseURL:LOCALHOST,
  headers:{'Authorization': process.env.API_KEY}
})

module.exports = supremeCourtApi

