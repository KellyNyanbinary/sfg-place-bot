// ==UserScript==
// @name         SR2 Bot
// @namespace    https://github.com/14ROVI/sr2-place-bot
// @version      4
// @description  SimpleRockets Chat community bot
// @author       14ROVI
// @match        https://www.reddit.com/r/place/*
// @match        https://new.reddit.com/r/place/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=reddit.com
// @require	     https://cdn.jsdelivr.net/npm/toastify-js
// @resource     TOASTIFY_CSS https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css
// @updateURL    https://github.com/14ROVI/sr2-place-bot/raw/main/bot.user.js
// @downloadURL  https://github.com/14ROVI/sr2-place-bot/raw/main/bot.user.js
// @grant        GM_getResourceText
// @grant        GM_addStyle
// ==/UserScript==

const VERSION = 4
var UPDATE_PENDING = false;

var accessToken;


async function getAccessToken() {
	let usingOldReddit = window.location.href.includes('new.reddit.com');
	let url = usingOldReddit ? 'https://new.reddit.com/r/place/' : 'https://www.reddit.com/r/place/';
	let response = await fetch(url);
	let responseText = await response.text();
	return responseText.split('\"accessToken\":\"')[1].split('"')[0];
}

(async function () {
	GM_addStyle(GM_getResourceText('TOASTIFY_CSS'));

	Toastify({
		text: 'Getting access token',
		duration: 10000
	}).showToast();
	accessToken = await getAccessToken();
	Toastify({
		text: 'Access token aquired',
		duration: 10000
	}).showToast();

	await attemptPlace();
})();


function getRandomPixel(pixelData) {
	let allPixels = []
	if (Date.now() > 1649133000 * 1000) {
		allPixels.push(...pixelData.structues["overwrite"]["pixels"]);
	} else {
		for (let structureName in pixelData.structures) {
			if (structureName != "overwrite") {
				allPixels.push(...pixelData.structures[structureName]["pixels"]);
			}
		}
	}
	return allPixels[Math.floor(Math.random() * allPixels.length)];
}


async function attemptPlace() {
	let pixelData = await getPixelData();
	console.log(pixelData);
	let randomPixel = getRandomPixel(pixelData);
	console.log(randomPixel);

	let x = randomPixel.x;
	let y = randomPixel.y;
	let colorId = randomPixel.color;

	console.log(`Placing pixel at (${x}, ${y}) ${randomPixel.color}`)
	Toastify({
		text: `Placing pixel at (${x}, ${y}) ${randomPixel.color}`,
		duration: 10000
	}).showToast();

	let time = new Date().getTime();
	let nextAvailablePixelTimestamp = await place(x, y, colorId) ?? new Date(time + 1000 * 60 * 5 + 1000 * 15)

	// Sanity check timestamp
	if (nextAvailablePixelTimestamp < time || nextAvailablePixelTimestamp > time + 1000 * 60 * 5 + 1000 * 15) {
		nextAvailablePixelTimestamp = time + 1000 * 60 * 5 + 1000 * 15;
	}

	// Add a few random seconds to the next available pixel timestamp
	let waitFor = nextAvailablePixelTimestamp - time + (Math.random() * 1000 * 15);

	let minutes = Math.floor(waitFor / (1000 * 60))
	let seconds = Math.floor((waitFor / 1000) % 60)
	Toastify({
		text: `Waiting ${minutes}m ${seconds}s until ${new Date(nextAvailablePixelTimestamp).toLocaleTimeString()} to place new pixel`,
		duration: waitFor
	}).showToast();
	
	setTimeout(
		attemptPlace,
		waitFor
	);
}


async function getPixelData() {
	let response = await fetch(
		"https://14rovi.github.io/sr2-place-bot/pixel.json",
		{cache: "no-store"}
	)
	if (!response.ok)
		return console.warn('Error getting the pixel map!');
		
	let pixelData = await response.json();

	let structureCount = Object.keys(pixelData.structures).length;
	let pixelCount = 0;
	for (let structureName in pixelData.structures) {
		pixelCount += pixelData.structures[structureName].pixels.length;
	}
	Toastify({
		text: `Structures: ${structureCount} - Pixels: ${pixelCount}.`,
		duration: 10000
	}).showToast();
	
	if (pixelData.version !== VERSION && !UPDATE_PENDING) {
		UPDATE_PENDING = true
		Toastify({
			text: `NEW VERSION: https://github.com/14ROVI/sr2-place-bot/raw/main/bot.user.js`,
			duration: -1,
			onClick: () => {
				window.location = 'https://github.com/14ROVI/sr2-place-bot/raw/main/bot.user.js'
			}
		}).showToast();
	}

	return pixelData;
}


async function place(x, y, color) {
	let response = await fetch("https://gql-realtime-2.reddit.com/query", {
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
						'canvasIndex': ((x > 1000) + (y > 1000) * 2)
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
	let data = await response.json()
	if (data.errors != undefined) {
		Toastify({
			text: 'Error placing pixel, waiting longer.',
			duration: 10000
		}).showToast();
		return data.errors[0].extensions?.nextAvailablePixelTs
	}
	return data?.data?.act?.data?.[0]?.data?.nextAvailablePixelTimestamp
}