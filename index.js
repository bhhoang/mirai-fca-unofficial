'use strict';

var utils = require("./utils");
var cheerio = require("cheerio");
var log = require("npmlog");
var logger = require('./logger');

var checkVerified = null;

var defaultLogRecordSize = 100;
log.maxRecordSize = defaultLogRecordSize;

function setOptions(globalOptions, options) {
    Object.keys(options).map(function(key) {
        switch (key) {
            case 'pauseLog':
                if (options.pauseLog) log.pause();
                break;
            case 'online':
                globalOptions.online = Boolean(options.online);
                break;
            case 'logLevel':
                log.level = options.logLevel;
                globalOptions.logLevel = options.logLevel;
                break;
            case 'logRecordSize':
                log.maxRecordSize = options.logRecordSize;
                globalOptions.logRecordSize = options.logRecordSize;
                break;
            case 'selfListen':
                globalOptions.selfListen = Boolean(options.selfListen);
                break;
            case 'listenEvents':
                globalOptions.listenEvents = Boolean(options.listenEvents);
                break;
            case 'pageID':
                globalOptions.pageID = options.pageID.toString();
                break;
            case 'updatePresence':
                globalOptions.updatePresence = Boolean(options.updatePresence);
                break;
            case 'forceLogin':
                globalOptions.forceLogin = Boolean(options.forceLogin);
                break;
            case 'userAgent':
                globalOptions.userAgent = options.userAgent;
                break;
            case 'autoMarkDelivery':
                globalOptions.autoMarkDelivery = Boolean(options.autoMarkDelivery);
                break;
            case 'autoMarkRead':
                globalOptions.autoMarkRead = Boolean(options.autoMarkRead);
                break;
            case 'listenTyping':
                globalOptions.listenTyping = Boolean(options.listenTyping);
                break;
            case 'proxy':
                if (typeof options.proxy != "string") {
                    delete globalOptions.proxy;
                    utils.setProxy();
                } else {
                    globalOptions.proxy = options.proxy;
                    utils.setProxy(globalOptions.proxy);
                }
                break;
            case 'autoReconnect':
                globalOptions.autoReconnect = Boolean(options.autoReconnect);
                break;
            case 'emitReady':
                globalOptions.emitReady = Boolean(options.emitReady);
                break;
            default:
                log.warn("setOptions", "Unrecognized option given to setOptions: " + key);
                break;
        }
    });
}

function buildAPI(globalOptions, html, jar) {
    var maybeCookie = jar.getCookies("https://www.facebook.com").filter(function(val) {
        return val.cookieString().split("=")[0] === "c_user";
    });

    if (maybeCookie.length === 0) throw { error: "Phát Hiện Lỗi Vị Trí ! Hãy Thử Đăng Nhập Vô Trình Duyệt Chorme Ẩn Danh Và Thử Lại !" };

    if (html.indexOf("/checkpoint/block/?next") > -1) log.warn("login", "Phát Hiện CheckPoint !, Hãy Thử Đăng Nhập Vô Trình Duyệt Ẩn Danh Và Thử Lại !");

    var userID = maybeCookie[0].cookieString().split("=")[1].toString();
    logger(`Đăng Nhập Tại ID: ${userID}`, "[ MIRAI ]");

    try {
        clearInterval(checkVerified);
    } catch (e) {
        console.log(e);
    }

    var clientID = (Math.random() * 2147483648 | 0).toString(16);

    let oldFBMQTTMatch = html.match(/irisSeqID:"(.+?)",appID:219994525426954,endpoint:"(.+?)"/);
    let mqttEndpoint = null;
    let region = null;
    let irisSeqID = null;
    var noMqttData = null;

    if (oldFBMQTTMatch) {
        irisSeqID = oldFBMQTTMatch[1];
        mqttEndpoint = oldFBMQTTMatch[2];
        region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
        logger(`Vùng Của Tài Khoản Là: ${region}`, "[ MIRAI ]");
    } else {
        let newFBMQTTMatch = html.match(/{"app_id":"219994525426954","endpoint":"(.+?)","iris_seq_id":"(.+?)"}/);
        if (newFBMQTTMatch) {
            irisSeqID = newFBMQTTMatch[2];
            mqttEndpoint = newFBMQTTMatch[1].replace(/\\\//g, "/");
            region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
            logger(`Vùng Của Tài Khoản Là:  ${region}`, "[ MIRAI ]");
        } else {
            let legacyFBMQTTMatch = html.match(/(\["MqttWebConfig",\[\],{fbid:")(.+?)(",appID:219994525426954,endpoint:")(.+?)(",pollingEndpoint:")(.+?)(3790])/);
            if (legacyFBMQTTMatch) {
                mqttEndpoint = legacyFBMQTTMatch[4];
                region = new URL(mqttEndpoint).searchParams.get("region").toUpperCase();
                log.warn("login", `Cannot get sequence ID with new RegExp. Fallback to old RegExp (without seqID)...`);
                logger(`Vùng Của Tài Khoản Là: ${region}`, "[ MIRAI ]");
                logger("login", `[Unused] Polling endpoint: ${legacyFBMQTTMatch[6]}`);
            } else {
                log.warn("login", "Không Thể Lấy ID Hãy Thử Lại !");
                noMqttData = html;
            }
        }
    }

    // All data available to api functions
    var ctx = {
        userID: userID,
        jar: jar,
        clientID: clientID,
        globalOptions: globalOptions,
        loggedIn: true,
        access_token: 'NONE',
        clientMutationId: 0,
        mqttClient: undefined,
        lastSeqId: irisSeqID,
        syncToken: undefined,
        mqttEndpoint,
        region,
        firstListen: true
    };

    var api = {
        setOptions: setOptions.bind(null, globalOptions),
        getAppState: function getAppState() {
            return utils.getAppState(jar);
        }
    };

    if (noMqttData) api["htmlData"] = noMqttData;

    const apiFuncNames = [
        'addExternalModule',
        'addUserToGroup',
        'changeAdminStatus',
        'changeArchivedStatus',
        'changeBio',
        'changeBlockedStatus',
        'changeGroupImage',
        'changeNickname',
        'changeThreadColor',
        'changeThreadEmoji',
        'createNewGroup',
        'createPoll',
        'deleteMessage',
        'deleteThread',
        'forwardAttachment',
        'getCurrentUserID',
        'getEmojiUrl',
        'getFriendsList',
        'getThreadHistory',
        'getThreadInfo',
        'getThreadList',
        'getThreadPictures',
        'getUserID',
        'getUserInfo',
        'handleMessageRequest',
        'listenMqtt',
        'logout',
        'markAsDelivered',
        'markAsRead',
        'markAsReadAll',
        'markAsSeen',
        'muteThread',
        'removeUserFromGroup',
        'resolvePhotoUrl',
        'searchForThread',
        'sendMessage',
        'sendTypingIndicator',
        'setMessageReaction',
        'setTitle',
        'threadColors',
        'unsendMessage',
        'unfriend',

        // HTTP
        'httpGet',
        'httpPost',

        // Deprecated features
        "getThreadListDeprecated",
        'getThreadHistoryDeprecated',
        'getThreadInfoDeprecated',
    ];

    var defaultFuncs = utils.makeDefaults(html, userID, ctx);

    // Load all api functions in a loop
    apiFuncNames.map(v => api[v] = require('./src/' + v)(defaultFuncs, api, ctx));

    return [ctx, defaultFuncs, api];
}

function makeLogin(jar, email, password, loginOptions, callback, prCallback) {
    return async function(res) {
        var html = res.body;
        var $ = cheerio.load(html);
        
        const jazoest = $('input[name=jazoest]').attr('value');
		const lsd = $('input[name=lsd]').attr('value');
		const publicKeyDataString = utils.getFrom(html, 'pubKeyData:', '}') + '}';
		const publicKeyData = {
			publicKey: utils.getFrom(publicKeyDataString, 'publicKey:"', '"'),
			keyId: utils.getFrom(publicKeyDataString, 'keyId:', '}')
		};
		// in newer versions of Facebook, encrypted password is being used
		// (even Instagram uses the same technique to send password during login)

		const currentTime = Math.floor(Date.now() / 1000).toString();
		const form = {
			jazoest,
			lsd,
			email,
			login_source: 'comet_headerless_login',
			next: '',
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			encpass: `#PWD_BROWSER:5:${currentTime}:${await require('./lib/passwordHasher.js')(
				publicKeyData,
				currentTime,
				password
			)}`
		};

		const loginUrl = `https://www.facebook.com/login/?privacy_mutation_token=${Buffer.from(
			`{"type":0,"creation_time":${currentTime},"callsite_id":381229079575946}`
		).toString('base64')}`;

        // Getting cookies from the HTML page... (kill me now plz)
        // we used to get a bunch of cookies in the headers of the response of the
        // request, but FB changed and they now send those cookies inside the JS.
        // They run the JS which then injects the cookies in the page.
        // The "solution" is to parse through the html and find those cookies
        // which happen to be conveniently indicated with a _js_ in front of their
        // variable name.
        //
        // ---------- Very Hacky Part Starts -----------------
        var willBeCookies = html.split("\"_js_");
        willBeCookies.slice(1).map(function(val) {
            var cookieData = JSON.parse("[\"" + utils.getFrom(val, "", "]") + "]");
            jar.setCookie(utils.formatCookie(cookieData, "facebook"), "https://www.facebook.com");
        });
        // ---------- Very Hacky Part Ends -----------------

        logger("Đang Đăng Nhập...", "[ MIRAI ]");
        return utils
            .post(loginUrl, jar, form, loginOptions)
            .then(utils.saveCookies(jar))
            .then(async function(res) {
                utils.saveCookies(jar)(res);

                const headers = res.headers;

                if (!res.body.includes('window.location.replace')) throw { error: 'Sai mật khẩu hoặc tài khoản' };
                const redirect = utils.getFrom(res.body, 'window.location.replace("', '")');
			    log.info('login', `Đang chuyển hướng tới ${redirect}`);
                if (headers.location && headers.location.indexOf('https://www.facebook.com/checkpoint/') > -1) {
                    log.info('login', 'Bạn đang bật bảo mật 2 lớp');


                // This means the account has login approvals turned on.
                if (redirect.includes('checkpoint')) {
                    log.info("Bạn Đang Bật 2 Bảo Mật !");
                    var nextURL = 'https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php';
                    return await utils
					.get(headers.location, jar, null, loginOptions)
					.then(utils.saveCookies(jar))
                    .then(async function(res) {
                        const html = res.body;
                        const $ = cheerio.load(html);
						let arr = [];
						$('form input').map(function (i, v) {
							arr.push({ val: $(v).val(), name: $(v).attr('name') });
						});

						arr = arr.filter(function (v) {
							return v.val && v.val.length;
						});
                        console.log(headers.location);
						const form = utils.arrToForm(arr);
         
                            if (redirect.includes('checkpoint')) {
                                throw {
                                    error: 'login-approval',
                                    continue: async function submit2FA(code) {
                                        form.approvals_code = code;
                                        form['submit[Continue]'] = 'Continue'; //'Continue';
                                        return await utils
                                            .post(nextURL, jar, form, loginOptions)
										    .then(utils.saveCookies(jar))

                                    }
                                            .then(async () => {
                                        // Use the same form (safe I hope)
                                        form.name_action_selected = 'save_device';

                                        return await utils.post(nextURL, jar, form, loginOptions).then(utils.saveCookies(jar));
                                    })
                                            .then(async (res)=>{
                                                if (!headers.location && res.body.indexOf('Review Recent Login') > -1) {
                                                    throw { error: 'Something went wrong with login approvals.' };
                                                }
                                            })
                                };
                            } else {
                                if (!loginOptions.forceLogin) throw { error: "Couldn't login. Facebook might have blocked this account. Please login with a browser or enable the option 'forceLogin' and try again." };

                                if (html.indexOf("Suspicious Login Attempt") > -1) form['submit[This was me]'] = "This was me";
                                else form['submit[This Is Okay]'] = "This Is Okay";

                                return utils
                                    .post(nextURL, jar, form, loginOptions)
                                    .then(utils.saveCookies(jar))
                                    .then(function() {
                                        // Use the same form (safe I hope)
                                        form.name_action_selected = 'save_device';

                                        return utils.post(nextURL, jar, form, loginOptions).then(utils.saveCookies(jar));
                                    })
                                    .then(function(res) {
                                        var headers = res.headers;

                                        if (!headers.location && res.body.indexOf('Review Recent Login') > -1) throw { error: "Something went wrong with review recent login." };

                                        var appState = utils.getAppState(jar);

                                        // Simply call loginHelper because all it needs is the jar
                                        // and will then complete the login process
                                        return loginHelper(appState, email, password, loginOptions, callback);
                                    })
                                    .catch(e => callback(e));
                            }
                        });
                }

                return utils.get('https://www.facebook.com/', jar, null, loginOptions).then(utils.saveCookies(jar));
            }
            });
    };
}

// Helps the login
function loginHelper(appState, email, password, globalOptions, callback, prCallback) {
    var mainPromise = null;
    var jar = utils.getJar();

    // If we're given an appState we loop through it and save each cookie
    // back into the jar.
    if (appState) {
        appState.map(function(c) {
            var str = c.key + "=" + c.value + "; expires=" + c.expires + "; domain=" + c.domain + "; path=" + c.path + ";";
            jar.setCookie(str, "http://" + c.domain);
        });

        // Load the main page.
        mainPromise = utils.get('https://www.facebook.com/', jar, null, globalOptions, { noRef: true }).then(utils.saveCookies(jar));
    } else {
        // Open the main page, then we login with the given credentials and finally
        // load the main page again (it'll give us some IDs that we need)
        mainPromise = utils
            .get("https://m.facebook.com/", null, null, globalOptions, { noRef: true })
            .then(utils.saveCookies(jar))
            .then(makeLogin(jar, email, password, globalOptions, callback, prCallback))
            .then(function() {
                return utils.get('https://www.facebook.com/', jar, null, globalOptions).then(utils.saveCookies(jar));
            });
    }

    var ctx = null;
    var _defaultFuncs = null;
    var api = null;

    mainPromise = mainPromise
        .then(function(res) {
            // Hacky check for the redirection that happens on some ISPs, which doesn't return statusCode 3xx
            var reg = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/;
            var redirect = reg.exec(res.body);
            if (redirect && redirect[1]) return utils.get(redirect[1], jar, null, globalOptions).then(utils.saveCookies(jar));
            return res;
        })
        .then(function(res) {
            var html = res.body;
            var stuff = buildAPI(globalOptions, html, jar);
            ctx = stuff[0];
            _defaultFuncs = stuff[1];
            api = stuff[2];
            return res;
        });

    // given a pageID we log in as a page
    if (globalOptions.pageID) {
        mainPromise = mainPromise
            .then(function() {
                return utils.get('https://www.facebook.com/' + ctx.globalOptions.pageID + '/messages/?section=messages&subsection=inbox', ctx.jar, null, globalOptions);
            })
            .then(function(resData) {
                var url = utils.getFrom(resData.body, 'window.location.replace("https:\\/\\/www.facebook.com\\', '");').split('\\').join('');
                url = url.substring(0, url.length - 1);
                return utils.get('https://www.facebook.com' + url, ctx.jar, null, globalOptions);
            });
    }

    mainPromise
        .then(function() {
            logger('Hoàn Thành Quá Trình Đăng Nhập !', "[ MIRAI ]");
                logger('Chúc Bạn Một Ngày Tốt Lành Nhé !', "[ MIRAI ]");
                    //!---------- Auto Check, Update START -----------------!//
                    var axios = require('axios');
                //var semver = require('semver');
            var { readFileSync } = require('fs');
        const { execSync } = require('child_process');
    axios.get('https://raw.githubusercontent.com/bhhoang/mirai-fca-unofficial/main/package.json').then(async (res) => {
        const localbrand = JSON.parse(readFileSync('./node_modules/mirai-fca-unofficial/package.json')).version;
            if (localbrand != res.data.version) {
                log.warn("MIRAI =>",`Có Phiên Bản Mới Là: ${JSON.parse(readFileSync('./node_modules/mirai-fca-unofficial/package.json')).version}  --> ${res.data.version} | Tự Động Update`);
                    try {
                        execSync('npm install git+https://github.com/bhhoang/mirai-fca-unofficial.git', { stdio: 'ignore' });
                        logger("Nâng Cấp Phiên Bản Thành Công!","[ MIRAI ]")
                        logger('Đang Khởi Động Lại...', '[ MIRAI ]');
                        console.clear();
                        process.exit(1);
                    }
                catch (err) {
                    log.warn('Lỗi Auto Update !' + err);
                    logger('Nâng Cấp Thất Bại !',"[ MIRAI ]");
                    logger("Hãy Tự Nâng Cấp Bằng Cách Nhập npm i git+https://github.com/bhhoang/mirai-fca-unofficial.git","[ MIRAI ]")
                    await new Promise(resolve => setTimeout(resolve, 5*1000));
                }
            finally {
        callback(null, api);
            }
                }
                else { 
                    logger(`Bạn Đang Sử Dụng Phiên Bản Mới Nhất: ` + localbrand + ' !', "[ MIRAI ]");
                    await new Promise(resolve => setTimeout(resolve, 2*1000));
                    callback(null, api);
                }
            });
        }).catch(function(e) {
            log.error("login", e.error || e);
        callback(e);
    });
                //!---------- Auto Check, Update END -----------------!//
}

function login(loginData, options, callback) {
    if (utils.getType(options) === 'Function' || utils.getType(options) === 'AsyncFunction') {
        callback = options;
        options = {};
    }

    var globalOptions = {
        selfListen: false,
        listenEvents: true,
        listenTyping: false,
        updatePresence: false,
        forceLogin: true,
        autoMarkDelivery: false,
        autoMarkRead: false,
        autoReconnect: true,
        logRecordSize: defaultLogRecordSize,
        online: false,
        emitReady: false,
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/600.3.18 (KHTML, like Gecko) Version/8.0.3 Safari/600.3.18"
    };

    setOptions(globalOptions, options);

    var prCallback = null;
    if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
        var rejectFunc = null;
        var resolveFunc = null;
        var returnPromise = new Promise(function(resolve, reject) {
            resolveFunc = resolve;
            rejectFunc = reject;
        });
        prCallback = function(error, api) {
            if (error) return rejectFunc(error);
            return resolveFunc(api);
        };
        callback = prCallback;
    }
    loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback, prCallback);
    return returnPromise;
}

module.exports = login;
