const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const querystring = require('querystring');
const { Base64 } = require('js-base64');
const randomstring = require('randomstring');

// Replace with your Telegram bot token
const token = '7901822583:AAE5HS_OwFcRf6iMUHNfQK9zkP_cIwb7TxM';
const bot = new TelegramBot(token, { polling: true });

// Zefoy class implementation in JavaScript
class Zefoy {
    constructor() {
        this.base_url = 'https://zefoy.com/';
        this.headers = {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
        };
        this.session = axios.create();
        this.captcha_auto_solve = true;
        this.captcha_1 = null;
        this.captcha_ = {};
        this.service = 'Views';
        this.comment_id = null;
        this.video_key = null;
        this.services = {};
        this.services_ids = {};
        this.services_status = {};
        this.url = 'None';
        this.text = 'By LORDHOZOO [No url]';
        this.video_url = 'https://vt.tiktok.com/ZShgtvedr/'; // Default video URL
    }

    async get_captcha() {
        try {
            if (fs.existsSync('session')) {
                this.session.defaults.headers.Cookie = `PHPSESSID=${fs.readFileSync('session', 'utf8')}`;
            }
            
            const request = await this.session.get(this.base_url, { headers: this.headers });
            
            if (request.data.includes('Enter Video URL')) {
                this.video_key = request.data.split('" placeholder="Enter Video URL"')[0].split('name="')[1];
                return true;
            } else if (request.data.includes('<title>Just a moment...</title>')) {
                console.log('Cloudflare protection is enabled');
                return false;
            }

            const regex = /<input type="hidden" name="(.*)" value="(.*)">/g;
            let match;
            while ((match = regex.exec(request.data))) {
                this.captcha_[match[1]] = match[2];
            }

            this.captcha_1 = request.data.split('type="text" name="')[1].split('" oninput="this.value=this.value.toLowerCase()"')[0];
            const captcha_url = request.data.split('<img src="')[1].split('" onerror="imgOnError()" class="')[0];
            
            const captchaRequest = await this.session.get(`${this.base_url}${captcha_url}`, {
                headers: this.headers,
                responseType: 'arraybuffer'
            });
            
            fs.writeFileSync('captcha.png', captchaRequest.data);
            console.log('Captcha image saved');
            return false;
        } catch (e) {
            console.log(`Can't get captcha: ${e}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return this.get_captcha();
        }
    }

    async send_captcha(new_session = false) {
        if (new_session) {
            this.session = axios.create();
            try {
                fs.unlinkSync('session');
            } catch (e) {}
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        const captchaResult = await this.get_captcha();
        if (captchaResult) {
            console.log('Connected to session');
            return { success: true, message: 'The session already exists' };
        }

        // Here you would implement your captcha solving logic
        // For simplicity, we'll just prompt the user to solve it
        console.log('Please solve the captcha in captcha.png');
        // In a real implementation, you would use a captcha solving service
        
        const captcha_solve = await this.solve_captcha('captcha.png');
        this.captcha_[this.captcha_1] = captcha_solve;
        
        const request = await this.session.post(this.base_url, {
            headers: this.headers,
            data: this.captcha_
        });

        if (request.data.includes('Enter Video URL')) {
            console.log('Session was created');
            fs.writeFileSync('session', this.session.defaults.headers.Cookie.split('PHPSESSID=')[1]);
            this.video_key = request.data.split('" placeholder="Enter Video URL"')[0].split('name="')[1];
            return { success: true, captcha_solve };
        } else {
            return { success: false, captcha_solve };
        }
    }

    async solve_captcha(path_to_file) {
        // In a real implementation, you would use a captcha solving service
        // For this example, we'll just prompt the user
        console.log(`Please solve the captcha in ${path_to_file}`);
        return new Promise(resolve => {
            const readline = require('readline').createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            readline.question('Enter the captcha text: ', (text) => {
                readline.close();
                resolve(text.trim());
            });
        });
    }

    async get_status_services() {
        const request = await this.session.get(this.base_url, { headers: this.headers });
        const data = request.data;
        
        // Parse services data
        // This is a simplified version - you would need to implement proper parsing
        const servicesRegex = /<h5 class="card-title">(.+?)<\/h5>\n.+?d-sm-inline-block">(.+?)<\/small>/g;
        let match;
        while ((match = servicesRegex.exec(data))) {
            this.services[match[1].trim()] = match[2].trim();
        }
        
        const servicesIdsRegex = /<h5 class="card-title mb-3">(.+?)<\/h5>\n<form action="(.+?)">/g;
        while ((match = servicesIdsRegex.exec(data))) {
            this.services_ids[match[1].trim()] = match[2].trim();
        }
        
        const servicesStatusRegex = /<h5 class="card-title">(.+?)<\/h5>\n.+?<button (.+?)>/g;
        while ((match = servicesStatusRegex.exec(data))) {
            this.services_status[match[1].trim()] = !match[2].includes('disabled class');
        }
        
        return { services: this.services, services_status: this.services_status };
    }

    async get_table() {
        const { services, services_status } = await this.get_status_services();
        
        // Create a simple table
        let table = "Status Services\n";
        table += "ID | Services | Status\n";
        table += "----------------------\n";
        
        let i = 1;
        for (const service in services) {
            const status = services_status[service] ? '🟢 Online' : '🔴 Offline';
            table += `${i} | ${service} | ${status}\n`;
            i++;
        }
        
        return table;
    }

    async find_video() {
        if (!this.service) {
            return { success: false, message: "You didn't choose the service" };
        }
        
        while (true) {
            if (!(this.service in this.services_ids)) {
                await this.get_status_services();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            const formData = new URLSearchParams();
            formData.append(this.video_key, this.url);
            
            const request = await this.session.post(`${this.base_url}${this.services_ids[this.service]}`, {
                headers: {
                    'user-agent': this.headers['user-agent'],
                    'origin': 'https://zefoy.com'
                },
                data: formData
            });
            
            try {
                this.video_info = Base64.decode(querystring.unescape(request.data.toString().split('').reverse().join('')));
                
                if (this.video_info.includes('Session expired. Please re-login')) {
                    console.log('Session expired. Reloging...');
                    await this.send_captcha();
                    return { success: false };
                } else if (this.video_info.includes('service is currently not working')) {
                    return { 
                        success: true, 
                        message: 'Service is currently not working, try again later. | You can change it in config.' 
                    };
                } else if (this.video_info.includes('onsubmit="showHideElements')) {
                    this.video_info = [
                        this.video_info.split('" name="')[1].split('"')[0],
                        this.video_info.split('value="')[1].split('"')[0]
                    ];
                    return { success: true, data: request.data };
                } else if (this.video_info.includes('Checking Timer...')) {
                    const timerMatch = this.video_info.match(/ltm=(\d*);/);
                    const t = timerMatch ? parseInt(timerMatch[1]) : 0;
                    
                    if (t === 0) {
                        return this.find_video();
                    } else if (t >= 1000) {
                        console.log('Your IP was banned');
                        return { success: false, message: 'IP banned' };
                    }
                    
                    console.log(`Time to next use: ${t}`);
                    await new Promise(resolve => setTimeout(resolve, t * 1000));
                    continue;
                } else if (this.video_info.includes('Too many requests. Please slow')) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } else {
                    console.log(this.video_info);
                }
            } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }
        }
    }

    async use_service() {
        const findResult = await this.find_video();
        if (!findResult.success) {
            return false;
        }
        
        this.token = randomstring.generate(16);
        const formData = new URLSearchParams();
        formData.append(this.video_info[0], this.video_info[1]);
        
        const request = await this.session.post(`${this.base_url}${this.services_ids[this.service]}`, {
            headers: {
                'user-agent': this.headers['user-agent'],
                'origin': 'https://zefoy.com'
            },
            data: formData
        });
        
        let res;
        try {
            res = Base64.decode(querystring.unescape(request.data.toString().split('').reverse().join('')));
        } catch (e) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            return "";
        }
        
        if (this.service === 'Comments Hearts') {
            const v = res.match(/<i class="text-red fa fa-heart"><\/i><\/div>\n<input type="hidden" name="([^"]+)".*\n<input type="hidden" name="([^"]+)"/);
            if (!v) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                return "";
            }
            
            const commentFormData = new URLSearchParams();
            commentFormData.append(v[1], this.video_info[1]);
            commentFormData.append(v[2], this.comment_id);
            
            const commentRequest = await this.session.post(`${this.base_url}${this.services_ids[this.service]}`, {
                headers: {
                    'user-agent': this.headers['user-agent'],
                    'origin': 'https://zefoy.com'
                },
                data: commentFormData
            });
            
            try {
                res = Base64.decode(querystring.unescape(commentRequest.data.toString().split('').reverse().join('')));
            } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                return "";
            }
        }
        
        if (res.includes('Session expired. Please re-login')) {
            console.log('Session expired. Reloging...');
            await this.send_captcha();
            return "";
        } else if (res.includes('sans-serif;text-align:center;color:green;\'>')) {
            const message = res.split("sans-serif;text-align:center;color:green;'>")[1].split("</")[0].trim();
            console.log(message);
            return message;
        } else if (res.includes('Too many requests. Please slow') || res.includes('Checking Timer')) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        } else if (res.includes('service is currently not working')) {
            return 'Service is currently not working, try again later. | You can change it in config.';
        } else if (this.video_info.includes('Please try again later. Server too busy')) {
            console.log('Error on submit: Please try again later. Server too busy.');
        } else {
            const message = res.split("sans-serif;text-align:center;color:green;'>")[1].split("</")[0].trim();
            console.log(message);
            return message;
        }
    }

    async get_video_info() {
        try {
            const videoId = this.url.split('/video/')[1];
            const response = await axios.get(`https://tiktok.livecounts.io/video/stats/${videoId}`, {
                headers: {
                    'authority': 'tiktok.livecounts.io',
                    'origin': 'https://livecounts.io',
                    'user-agent': this.headers['user-agent']
                }
            });
            
            if (response.data.viewCount) {
                return response.data;
            }
        } catch (e) {
            return { viewCount: 0, likeCount: 0, commentCount: 0, shareCount: 0 };
        }
    }

    async get_video_id(url_ = null, set_url = true) {
        if (!url_) url_ = this.url;
        if (url_.endsWith('/')) url_ = url_.slice(0, -1);
        
        const url = url_.split('/').pop();
        if (/^\d+$/.test(url)) {
            if (set_url) this.url = url_;
            return url_;
        }
        
        try {
            const response = await axios.get(`https://api.tokcount.com/?type=videoID&username=https://vm.tiktok.com/${url}`, {
                headers: {
                    'origin': 'https://tokcount.com',
                    'authority': 'api.tokcount.com',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36'
                }
            });
            
            if (!response.data) {
                console.log('Invalid URL | Replace in config');
                return false;
            }
            
            const json_ = response.data;
            if (!json_.author) {
                console.log(`${this.url}| invalid URL | Replace in config`);
                return false;
            }
            
            if (set_url) {
                this.url = `https://www.tiktok.com/@${json_.author}/video/${json_.id}`;
                console.log(`Formated video url --> ${this.url}`);
            }
            
            return response.data;
        } catch (e) {
            console.log('Error getting video ID:', e);
            return false;
        }
    }

    async check_config(once = false) {
        while (true) {
            try {
                const last_url = this.url;
                const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
                
                this.url = config.url;
                this.service = config.service;
                this.comment_id = config.comment_id;
                this.captcha_auto_solve = config.captcha_auto_solve;
                this.proxy_ = config.proxy || null;
                
                if (last_url !== this.url) {
                    await this.get_video_id();
                }
                
                this.change_config();
            } catch (e) {
                console.log(e);
            }
            
            if (once) break;
            await new Promise(resolve => setTimeout(resolve, 4000));
        }
    }

    change_config() {
        fs.writeFileSync('config.json', JSON.stringify({
            url: this.url,
            service: this.service,
            comment_id: this.comment_id,
            proxy: this.proxy_,
            captcha_auto_solve: this.captcha_auto_solve
        }, null, 4));
    }

    async update_name() {
        while (true) {
            try {
                const video_info = await this.get_video_info();
                this.text = `By @LORDHOZOO| Views: ${video_info.viewCount} | Likes: ${video_info.likeCount} | Comments: ${video_info.commentCount} | Shares: ${video_info.shareCount}`;
                process.title = this.text;
            } catch (e) {
                console.log('Error updating title:', e);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    // New method to handle TikTok video URL
    async getTikTokVideo(url) {
        try {
            // This is a placeholder - you would need to implement actual TikTok video download
            // In a real implementation, you would use a TikTok API or scraper
            
            // For demo purposes, we'll just return the URL you provided
            return {
                success: true,
                video_url: url,
                download_url: url // This would be the direct MP4 URL in a real implementation
            };
        } catch (e) {
            console.log('Error getting TikTok video:', e);
            return { success: false, error: e.message };
        }
    }
}

// Initialize Zefoy
if (!fs.existsSync('config.json')) {
    fs.writeFileSync('config.json', JSON.stringify({
        url: 'https://www.tiktok.com/t/ZTRToxYct',
        service: 'Views',
        comment_id: null,
        proxy: null,
        captcha_auto_solve: false
    }, null, 4));
}

const zefoy = new Zefoy();
zefoy.check_config(true);

// Telegram bot commands
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const options = {
        reply_markup: JSON.stringify({
            keyboard: [
                ['🔄 Check Services Status'],
                ['🎥 Play TikTok Video'],
                ['📊 Get Video Stats'],
                ['⚙️ Settings']
            ],
            resize_keyboard: true,
            one_time_keyboard: true
        })
    };
    
    bot.sendMessage(chatId, 'Welcome to Zefoy Telegram Bot! Choose an option:', options);
});

bot.onText(/🔄 Check Services Status/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const table = await zefoy.get_table();
        bot.sendMessage(chatId, table);
    } catch (e) {
        bot.sendMessage(chatId, `Error checking services: ${e.message}`);
    }
});

bot.onText(/🎥 Play TikTok Video/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Please send me the TikTok video URL you want to play');
    
    // Listen for the next message with the URL
    bot.once('message', async (msg) => {
        if (msg.text && msg.text.includes('tiktok.com')) {
            try {
                const result = await zefoy.getTikTokVideo(msg.text);
                if (result.success) {
                    // In a real implementation, you would send the actual MP4 file
                    // For this example, we'll just send the URL
                    bot.sendMessage(chatId, `Here's your TikTok video: ${result.download_url}`);
                    
                    // If you had the actual MP4 file, you would do:
                    // bot.sendVideo(chatId, result.download_url);
                } else {
                    bot.sendMessage(chatId, `Error: ${result.error}`);
                }
            } catch (e) {
                bot.sendMessage(chatId, `Error processing video: ${e.message}`);
            }
        } else {
            bot.sendMessage(chatId, 'Please send a valid TikTok URL');
        }
    });
});

bot.onText(/📊 Get Video Stats/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        const stats = await zefoy.get_video_info();
        bot.sendMessage(chatId, `Video Stats:
Views: ${stats.viewCount}
Likes: ${stats.likeCount}
Comments: ${stats.commentCount}
Shares: ${stats.shareCount}`);
    } catch (e) {
        bot.sendMessage(chatId, `Error getting video stats: ${e.message}`);
    }
});

bot.onText(/⚙️ Settings/, (msg) => {
    const chatId = msg.chat.id;
    const options = {
        reply_markup: JSON.stringify({
            inline_keyboard: [
                [{ text: 'Change Video URL', callback_data: 'change_url' }],
                [{ text: 'Change Service', callback_data: 'change_service' }],
                [{ text: 'Toggle Auto Solve Captcha', callback_data: 'toggle_captcha' }]
            ]
        })
    };
    bot.sendMessage(chatId, 'Settings:', options);
});

bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    if (data === 'change_url') {
        bot.sendMessage(chatId, 'Please send me the new TikTok video URL');
        bot.once('message', async (msg) => {
            if (msg.text && msg.text.includes('tiktok.com')) {
                zefoy.url = msg.text;
                zefoy.change_config();
                bot.sendMessage(chatId, 'Video URL updated successfully!');
            } else {
                bot.sendMessage(chatId, 'Invalid URL. Please try again.');
            }
        });
    } else if (data === 'change_service') {
        try {
            const table = await zefoy.get_table();
            bot.sendMessage(chatId, `${table}\n\nPlease reply with the service number you want to use`);
            
            bot.once('message', async (msg) => {
                const serviceNum = parseInt(msg.text);
                if (!isNaN(serviceNum) && serviceNum > 0) {
                    const services = Object.keys(zefoy.services);
                    if (serviceNum <= services.length) {
                        zefoy.service = services[serviceNum - 1];
                        zefoy.change_config();
                        bot.sendMessage(chatId, `Service changed to: ${zefoy.service}`);
                    } else {
                        bot.sendMessage(chatId, 'Invalid service number. Please try again.');
                    }
                } else {
                    bot.sendMessage(chatId, 'Please enter a valid number.');
                }
            });
        } catch (e) {
            bot.sendMessage(chatId, `Error changing service: ${e.message}`);
        }
    } else if (data === 'toggle_captcha') {
        zefoy.captcha_auto_solve = !zefoy.captcha_auto_solve;
        zefoy.change_config();
        bot.sendMessage(chatId, `Auto solve captcha is now ${zefoy.captcha_auto_solve ? 'enabled' : 'disabled'}`);
    }
});

console.log('Bot is running...');
