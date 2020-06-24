const cron = require("node-cron");
const Cache = require("node-cache");
const { WebhookClient } = require("discord.js");
const { createTwoFilesPatch, parsePatch } = require("diff");
const dayjs = require("dayjs");
const fetch = require("node-fetch");

const config = process.env;

if (!cron.validate(config.CRON)) {
    console.error(`The cron expression '${config.CRON}' is invalid.`);

    return;
}

(async () => {
    const cache = new Cache();
    const webhookClient = new WebhookClient(config.DISCORD_WEBHOOK_ID, config.DISCORD_WEBHOOK_TOKEN);
    const html = await getPage(config.WATCH_URL);

    cache.set(config.WATCH_NAME, html);
    cron.schedule(config.CRON, async () => {
        log("Started");
        const html = await getPage(config.WATCH_URL);
        const diff = createTwoFilesPatch(
            "cached", "fresh", // filenames
            cache.get(config.WATCH_NAME), html, // content
            undefined, undefined, // file headers
            { context: 0 } // options
        );
        const [parsedDiff] = parsePatch(diff);

        if (parsedDiff.hunks.length > 0) {
            log("Change detected");
            await webhookClient.send(buildNotification(config.WATCH_NAME, parsedDiff.hunks));
        } else {
            log("No change detected");
        }

        cache.set(config.WATCH_NAME, html);
        log("Stopped");
    });
})();

async function getPage(url) {
    try {
        const response = await fetch(url);

        return await response.text();
    } catch (error) {
        // Not sure why this is happening, but it clears up on the next call so
        // just retry one more time.
        if (error.code === "ECONNRESET") {
            log("Retrying");
            const response = await fetch(url);

            return await response.text();
        }
    }
}

function buildNotification(name, hunks) {
    let content = `Changes detected for **${name}**\n`;

    content += "```diff\n" + hunks
        .reduce((body, hunk) => `${body}${buildHunkHeader(hunk)}${buildHunkLines(hunk)}\n`, "") + "\n```";

    return content;
}

function buildHunkHeader(hunk) {
    return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
}

function buildHunkLines(hunk) {
    return hunk.lines.map((line, index) => `${line}${hunk.linedelimiters[index]}`).join("");
}

function log(message) {
    console.log(`[${dayjs().toISOString()}] ${message}`);
}
