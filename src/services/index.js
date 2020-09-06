const axios = require('axios');
const dotenv = require('dotenv')

dotenv.config()

const LOCALHOST = "http://localhost:3000/precedent"
const PRODSERVER = "https://law-bot.me/precedent"

const supremeCourtApi = axios.create({
  baseURL:PRODSERVER,
  headers:{'Authorization': process.env.API_KEY}
})

module.exports = supremeCourtApi

