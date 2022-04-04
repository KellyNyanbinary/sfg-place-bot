// ==UserScript==
// @name         NERV Bot
// @namespace    https://github.com/14ROVI/nerv-bot
// @version      2.4
// @description  The bot for NERV!
// @author       14ROVI
// @match        https://www.reddit.com/r/place/*
// @match        https://new.reddit.com/r/place/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @require	     https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL    https://github.com/14ROVI/nerv-bot/raw/master/bot.user.js
// @downloadURL  https://github.com/14ROVI/nerv-bot/raw/master/bot.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==


var placeOrders = [];
var accessToken;
var canvas = document.createElement('canvas');

const VERSION = 2.4
var UPDATE_PENDING = false;

const COLOR_MAPPINGS = {
	'#6D001A': 0,
	'#BE0039': 1,
	'#FF4500': 2,
	'#FFA800': 3,
	'#FFD635': 4,
	'#FFF8B8': 5,
	'#00A368': 6,
	'#00CC78': 7,
	'#7EED56': 8,
	'#00756F': 9,
	'#009EAA': 10,
	'#00CCC0': 11,
	'#2450A4': 12,
	'#3690EA': 13,
	'#51E9F4': 14,
	'#493AC1': 15,
	'#6A5CFF': 16,
	'#94B3FF': 17,
	'#811E9F': 18,
	'#B44AC0': 19,
	'#E4ABFF': 20,
	'#DE107F': 21,
	'#FF3881': 22,
	'#FF99AA': 23,
	'#6D482F': 24,
	'#9C6926': 25,
	'#FFB470': 26,
	'#000000': 27,
	'#515252': 28,
	'#898D90': 29,
	'#D4D7D9': 30,
	'#FFFFFF': 31
};

(async function () {
	GM_addStyle(GM_getResourceText('TOASTIFY_CSS'));
	canvas.width = 2000;
	canvas.height = 2000;
	canvas = document.body.appendChild(canvas);

	Toastify({
		text: 'Getting access token',
		duration: 10000
	}).showToast();
	accessToken = await getAccessToken();
	Toastify({
		text: 'Access token aquired',
		duration: 10000
	}).showToast();

	setInterval(updateOrders, 5 * 60 * 1000); // Update orders every 5 mins
	await updateOrders();
	attemptPlace();
})();

function shuffleWeighted(array) {
	for (const item of array) {
		item.rndPriority = Math.round(placeOrders.priorities[item.priority] * Math.random());
	}
	array.sort((a, b) => b.rndPriority - a.rndPriority);
}

function getPixelList() {
	const structures = [];
	for (const structureName in placeOrders.structures) {
		shuffleWeighted(placeOrders.structures[structureName].pixels);
		structures.push(placeOrders.structures[structureName]);
	}
	shuffleWeighted(structures);
	return structures.map(structure => structure.pixels).flat();
}

async function attemptPlace() {
	var ctx;
	try {
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('0'), canvas, 0, 0);
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('1'), canvas, 1000, 0)
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('2'), canvas, 0, 1000)
		ctx = await getCanvasFromUrl(await getCurrentImageUrl('3'), canvas, 1000, 1000)

	} catch (e) {
		console.warn('Error getting pixel art:', e);
		Toastify({
			text: 'Error getting pixel art, trying again in 10s',
			duration: 10000
		}).showToast();
		setTimeout(attemptPlace, 15000); // probeer opnieuw in 15sec.
		return;
	}

	const pixelList = getPixelList();

	for (const order of pixelList) {
		const x = order.x;
		const y = order.y;
		const colorId = COLOR_MAPPINGS[order.color] ?? order.color;

		const rgbaAtLocation = ctx.getImageData(x, y, 1, 1).data;
		const hex = rgbToHex(rgbaAtLocation[0], rgbaAtLocation[1], rgbaAtLocation[2]);
		const currentColorId = COLOR_MAPPINGS[hex];
		// Pixel already set
		if (currentColorId == colorId) continue;

		Toastify({
			text: `Placing pixel at (${x}, ${y}) ${hex}`,
			duration: 10000
		}).showToast();
		console.log(`Placing pixel at (${x}, ${y}) ${hex}`)

		const time = new Date().getTime();
		let nextAvailablePixelTimestamp = await place(x, y, colorId) ?? new Date(time + 1000 * 60 * 5 + 1000 * 15)

		// Sanity check timestamp
		if (nextAvailablePixelTimestamp < time || nextAvailablePixelTimestamp > time + 1000 * 60 * 5 + 1000 * 15) {
			nextAvailablePixelTimestamp = time + 1000 * 60 * 5 + 1000 * 15;
		}

		// Add a few random seconds to the next available pixel timestamp
		const waitFor = nextAvailablePixelTimestamp - time + (Math.random() * 1000 * 15);

		const minutes = Math.floor(waitFor / (1000 * 60))
		const seconds = Math.floor((waitFor / 1000) % 60)
		Toastify({
			text: `Waiting ${minutes}m ${seconds}s until ${new Date(nextAvailablePixelTimestamp).toLocaleTimeString()} to place new pixel`,
			duration: waitFor
		}).showToast();
		setTimeout(attemptPlace, waitFor);
		return;
	}
	
	setTimeout(attemptPlace, 30000); // probeer opnieuw in 30sec.
}

function updateOrders() {
	fetch(`https://14rovi.github.io/nerv-bot/pixel.json`, {cache: "no-store"}).then(async (response) => {
		if (!response.ok) return console.warn('Error getting the pixel map!');
		const data = await response.json();

		if (JSON.stringify(data) !== JSON.stringify(placeOrders)) {
			const structureCount = Object.keys(data.structures).length;
			let pixelCount = 0;
			for (const structureName in data.structures) {
				pixelCount += data.structures[structureName].pixels.length;
			}
			Toastify({
				text: `Structures: ${structureCount} - Pixels: ${pixelCount}.`,
				duration: 10000
			}).showToast();
		}

		if (data?.version !== VERSION && !UPDATE_PENDING) {
			UPDATE_PENDING = true
			Toastify({
				text: `NEW VERSION: https://github.com/14ROVI/nerv-bot/raw/master/bot.user.js`,
				duration: -1,
				onClick: () => {
					// Tapermonkey captures this and opens a new tab
					window.location = 'https://github.com/14ROVI/nerv-bot/raw/master/bot.user.js'
				}
			}).showToast();

		}
		placeOrders = data;
	}).catch((e) => console.warn('Orders can\'t be loaded', e));
}


function getCanvasId(x,y) {
	return (x > 1000) + (y > 1000)*2
}
/**
 * Places a pixel on the canvas, returns the "nextAvailablePixelTimestamp", if succesfull
 * @param x
 * @param y
 * @param color
 * @returns {Promise<number>}
 */
async function place(x, y, color) {
	const response = await fetch('https://gql-realtime-2.reddit.com/query', {
		method: 'POST',
		body: JSON.stringify({
			'operationName': 'setPixel',
			'variables': {
				'input': {
					'actionName': 'r/replace:set_pixel',
					'PixelMessageData': {
						'coordinate': {
							'x': x % 1000,
							'y': y % 1000
						},
						'colorIndex': color,
						'canvasIndex': getCanvasId(x,y)
					}
				}
			},
			'query': `mutation setPixel($input: ActInput!) {
				act(input: $input) {
					data {
						... on BasicMessage {
							id
							data {
								... on GetUserCooldownResponseMessageData {
									nextAvailablePixelTimestamp
									__typename
								}
								... on SetPixelResponseMessageData {
									timestamp
									__typename
								}
								__typename
							}
							__typename
						}
						__typename
					}
					__typename
				}
			}
			`
		}),
		headers: {
			'origin': 'https://hot-potato.reddit.com',
			'referer': 'https://hot-potato.reddit.com/',
			'apollographql-client-name': 'mona-lisa',
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
	const data = await response.json()
	if (data.errors != undefined) {
		Toastify({
			text: 'Error placing pixel, waiting longer.',
			duration: 10000
		}).showToast();
		return data.errors[0].extensions?.nextAvailablePixelTs
	}
	return data?.data?.act?.data?.[0]?.data?.nextAvailablePixelTimestamp
}

async function getAccessToken() {
	const usingOldReddit = window.location.href.includes('new.reddit.com');
	const url = usingOldReddit ? 'https://new.reddit.com/r/place/' : 'https://www.reddit.com/r/place/';
	const response = await fetch(url);
	const responseText = await response.text();

	// TODO: ew
	return responseText.split('\"accessToken\":\"')[1].split('"')[0];
}

async function getCurrentImageUrl(id = '0') {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket('wss://gql-realtime-2.reddit.com/query', 'graphql-ws');

		ws.onopen = () => {
			ws.send(JSON.stringify({
				'type': 'connection_init',
				'payload': {
					'Authorization': `Bearer ${accessToken}`
				}
			}));
			ws.send(JSON.stringify({
				'id': '1',
				'type': 'start',
				'payload': {
					'variables': {
						'input': {
							'channel': {
								'teamOwner': 'AFD2022',
								'category': 'CANVAS',
								'tag': id
							}
						}
					},
					'extensions': {},
					'operationName': 'replace',
					'query': `subscription replace($input: SubscribeInput!) {
						subscribe(input: $input) {
							id
							... on BasicMessage {
								data {
									__typename
									... on FullFrameMessageData {
										__typename
										name
										timestamp
									}
								}
								__typename
							}
							__typename
						}
					}
					`
				}
			}));
		};

		ws.onmessage = (message) => {
			const { data } = message;
			const parsed = JSON.parse(data);

			// TODO: ew
			if (!parsed.payload || !parsed.payload.data || !parsed.payload.data.subscribe || !parsed.payload.data.subscribe.data) return;

			ws.close();
			resolve(parsed.payload.data.subscribe.data.name + `?noCache=${Date.now() * Math.random()}`);
		}


		ws.onerror = reject;
	});
}

function getCanvasFromUrl(url, canvas, x = 0, y = 0) {
	return new Promise((resolve, reject) => {
		var ctx = canvas.getContext('2d');
		var img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			ctx.drawImage(img, x, y);
			resolve(ctx);
		};
		img.onerror = reject;
		img.src = url;
	});
}

function rgbToHex(r, g, b) {
	return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}