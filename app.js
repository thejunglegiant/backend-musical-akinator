const PORT      = process.env.PORT || 9333;
const express = require('express'),
settings      = require('./settings'),
request       = require('request'),
https         = require('https'),
cors          = require('cors'),
fs            = require('fs'),
qs            = require('qs'),
app           = express();

// const privateKey  = fs.readFileSync('key.pem'),
// certificate = fs.readFileSync('cert.pem');
// const credentials = {key: privateKey, cert: certificate};
// const httpsServer = https.createServer(credentials, app);

let usersArray = [];

const allowedOrigins = ['http://localhost:9333',
                      'https://muz.dkaraush.me',
                      'http://muz.dkaraush.me',
                      'http://localhost:3000',
                    ];
app.use(cors({
    origin: function(origin, callback) {
        if(!origin) return callback(null, true);
        if(allowedOrigins.indexOf(origin) === -1){
        const msg = 'The CORS policy for this site does not ' +
                    'allow access from the specified Origin.';
        return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

//===================
// SIMPLE SCORE
//===================

const manageScore = (userId) => {
    let temp = null;

    for (const user of usersArray) {
        if (user.session_id === userId) {
            if ((Date.now() - user.start_time) / 1000 / 60 > 30) {
                usersArray.splice(usersArray.indexOf(user), 1);
            } else {
                temp = {
                    session_id: user.session_id,
                    start_time: user.start_time,
                    computer: user.computer,
                    human: user.human,
                }
            }
            break;
        }
    }

    if (temp === null) {
        usersArray.push({
            session_id: userId,
            start_time: Date.now(),
            computer: 0,
            human: 0
        });

        temp = usersArray[usersArray.length - 1];
    }

    return temp;
}

//===================
// API'S METHODS
//===================

function escapeQuotes(str) {
    return str.replace(/\"/g, "\\\"");
}

function getSongFromGenius(songId) {
    return new Promise((resolve, reject) => {
        request({
            method: 'GET',
            url: `https://api.genius.com/songs/${songId}
            ?access_token=${settings.GENIUS_TOKEN}`
        }, (err, _res, body) => {
            if (err) return reject(err);
            try {
                return resolve(JSON.parse(body).response.song);
            } catch (e) {
                reject(e);
            }                
        });
    });
}

// function getSongFromGeniusByName(title, artist) {
//     return new Promise((resolve, reject) => {
//         request({
//             method: 'GET',
//             url: `https://api.genius.com/search?` + qs.stringify({
//                 q: escapeQuotes(title)+' '+escapeQuotes(artist)
//             }),
//             headers: {
//                 Authorization: `Bearer ${settings.GENIUS_TOKEN}`
//             }
//         }, (err, _res, body) => {
//             if (err) return reject(err);
//             try {
//                 return resolve(JSON.parse(body).response.hits[0]);
//             } catch (e) {
//                 reject(e);
//             }                
//         });
//     });
// }

function getSongFromDeezer(title, artist) {
    return new Promise((resolve, reject) => {
        request({
            method: 'GET',
            url: "https://api.deezer.com/search?" + qs.stringify({
                q: 'artist:"'+escapeQuotes(artist)+'" track:"'+escapeQuotes(title)+'"',
                strict: 'on'
            })
        }, (err, _res, body) => {
            if (err) return reject(err);
            let data = JSON.parse(body);
            if (data.total > 0) {
                data = data.data[0]
                let respond = {
                    url: data.link,
                    cover: null
                };
                try {
                    if (data.album && data.album.cover_big) {
                        respond.cover = data.album.cover_big;
                    } else if (data.artist && data.artist.picture_big) {
                        respond.cover = data.artist.picture_big;
                    }
                    return resolve(respond);
                } catch (e) {
                    reject(e);
                }
            } else {
                return resolve(null);
            }
        });
    });
}

function getSongFromAuddByName(title, artist) {
    return new Promise((resolve, reject) => {
        request({
            method: 'GET',
            url: "https://api.audd.io/findLyrics/?" + qs.stringify({
                access_token: settings.AUDD_TOKEN,
                q: escapeQuotes(artist)+' '+escapeQuotes(title)
            })
        }, (err, _res, body) => {
            if (err) return reject(err);
            try {
                const data = JSON.parse(body);
                return resolve(data.result[0]);
            } catch (e) {
                reject(e);
            }                
        });
    });
}

//===================
// ROUTES
//===================

app.get("/test", (req, res) => {
    res.send("Test page.");
});

app.post("/humming", (req, res) => {
    let respond = null;
    const score = manageScore(req.query.session);
    let _req = https.request({
        method: "POST",
        hostname: "api.audd.io",
        path: `/recognizeWithOffset/?api_token=${settings.AUDD_TOKEN}`,
        headers: {
            "Content-Type": req.headers['content-type']
        },
    }, (_res) => {
        let chunks = [];
        _res.on('data', chunk => chunks.push(chunk));
        _res.on('end', () => {
            let data = JSON.parse(Buffer.concat(chunks).toString());
            if (data.result !== null && typeof data.result.list !== 'undefined'
                    && data.result.list !== null && data.result.list.length > 0) {
                getSongFromAuddByName(data.result.list[0].title, data.result.list[0].artist).then(song => {
                    getSongFromGenius(song.song_id).then(val => {
                        getSongFromDeezer(data.result.list[0].title, data.result.list[0].artist).then(deezerTrack => {
                            let hasDeezer = false;
                            let media = [];
                            let cover = deezerTrack === null ? null : deezerTrack.cover;
                            for (const elem of JSON.parse(song.media)) {
                                if (elem.provider === "deezer")
                                    hasDeezer = true;
                                media.push({
                                    provider: elem.provider,
                                    url: elem.url,
                                });
                            }
                            media.push({
                                provider: "genius",
                                url: "https://genius.com" + val.path,
                            })

                            if (!hasDeezer && deezerTrack !== null) {
                                media.push({
                                    provider: "deezer",
                                    url: deezerTrack.url,
                                })
                            }

                            if (cover !== null && val.song_art_image_url) {
                                cover = val.song_art_image_url;
                            } else if (cover !== null && val.album.image_url) {
                                cover = val.album.image_url;
                            } else if (cover !== null) {
                                cover = val.primary_artist.image_url;
                            }
                            respond = {
                                result: {
                                    title: song.title,
                                    artist: song.artist,
                                    media: media,
                                    lyrics: song.lyrics,
                                    cover: cover,
                                },
                                score: {
                                    computer: score.computer,
                                    human: score.human,
                                },
                            }
                            res.send(respond);
                        }).catch(e => {
                            console.log(e);
                        });
                    }).catch(e => {
                        console.log(e);
                    });
                }).catch(e => {
                    console.log(e);
                });
            } else if (typeof data.error !== 'undefined') {
                respond = {
                    result: null,
                    error: {
                        api: "audd.io",
                        code: data.error.error_code,
                    },
                    score: {
                        computer: score.computer,
                        human: score.human,
                    },
                }
                res.send(respond);
            } else {
                respond = {
                    result: null,
                    error: {
                        api: "audd.io",
                        code: null,
                    },
                    score: {
                        computer: score.computer,
                        human: score.human,
                    },
                }
                res.send(respond);
            }
        });
    });
    req.on('data', chunk => _req.write(chunk));
    req.on('end', () => _req.end());
});

app.post("/lyrics", (req, res) => {
    let respond = null;
    const score = manageScore(req.query.session);

    const options = {
        q: req.query.q,
        api_token: settings.AUDD_TOKEN
    }

    request({
        url: 'https://api.audd.io/findLyrics/',
        qs: options,
        method: 'POST'
    }, (err, _res, body) => {
        if (!err) {
            const data = JSON.parse(body);
            if (typeof data.result !== 'undefined' && data.result.length > 0) {
                getSongFromGenius(data.result[0].song_id).then(val => {
                    getSongFromDeezer(data.result[0].title, data.result[0].artist).then(deezerTrack => {
                        let media = [];
                        let hasDeezer = false;
                        let cover = deezerTrack === null ? val.header_image_url : deezerTrack.cover;
                        for (const elem of JSON.parse(data.result[0].media)) {
                            if (elem.provider === "deezer")
                                hasDeezer = true;
                            media.push({
                                provider: elem.provider,
                                url: elem.url,
                            });
                        }
                        media.push({
                            provider: "genius",
                            url: "https://genius.com" + val.path,
                        });
                        if (!hasDeezer && deezerTrack !== null) {
                            media.push({
                                provider: "deezer",
                                url: deezerTrack.url,
                            })
                        }

                        respond = {
                            result: {
                                title: data.result[0].title,
                                artist: data.result[0].artist,
                                media: media,
                                lyrics: data.result[0].lyrics,
                                cover: cover,
                            },
                            score: {
                                computer: score.computer,
                                human: score.human,
                            },
                        }
                        res.send(respond);

                    }).catch((e) => {
                        console.log(e);
                    });
                }).catch((e) => {
                    console.log(e);
                });
            } else if (typeof data.error !== 'undefined') {
                respond = {
                    result: null,
                    error: {
                        api: "audd.io",
                        code: data.error.error_code,
                    },
                    score: {
                        computer: score.computer,
                        human: score.human,
                    },
                }
                res.send(respond);
            } else {
                respond = {
                    result: null,
                    error: {
                        api: "audd.io",
                        code: null,
                    },
                    score: {
                        computer: score.computer,
                        human: score.human,
                    },
                }
                res.send(respond);
            }
        }
    });
});

app.post("/right", (req, res) => {
    let foundUser = usersArray.find((user) => {
        return user.session_id === req.query.session;
    });
    if (typeof foundUser !== 'undefined' && foundUser !== null) {
        foundUser.computer += 1;
        res.send({
            computer: foundUser.computer,
            human: foundUser.human
        });
    } else {
        res.send({
            computer: 0,
            human: 0
        });
    }
});

app.post("/wrong", (req, res) => {
    let foundUser = usersArray.find((user) => {
        return user.session_id === req.query.session;
    });
    if (typeof foundUser !== 'undefined' && foundUser !== null) {
        foundUser.human += 1;
        res.send({
            computer: foundUser.computer,
            human: foundUser.human
        });
    } else {
        res.send({
            computer: 0,
            human: 0
        });
    }
});

// httpServer.listen(PORT, () => {
//     console.log("Server started at: " + PORT);
// });

app.listen(PORT, () => {
    console.log("Server started at: " + PORT);
});