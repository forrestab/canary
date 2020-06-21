const cron = require("node-cron");
const Cache = require("node-cache");
const { WebhookClient } = require("discord.js");
const axios = require("axios");
const { createTwoFilesPatch, parsePatch } = require("diff");
const dayjs = require("dayjs");

const config = process.env;

if (!cron.validate(config.CRON)) {
    console.error(`The cron expression '${config.CRON}' is invalid.`);

    return;
}

(async () => {
    const cache = new Cache();
    const webhookClient = new WebhookClient(config.DISCORD_WEBHOOK_ID, config.DISCORD_WEBHOOK_TOKEN);
    let { data: html } = await axios.get(config.WATCH_URL);

    cache.set(config.WATCH_NAME, html);
    cron.schedule(config.CRON, async () => {
        console.log(`[${dayjs().toISOString()}] Started`);
        let { data: html } = await axios.get(config.WATCH_URL);
        const diff = createTwoFilesPatch(
            "cached", "fresh", // filenames
            cache.get(config.WATCH_NAME), html, // content
            undefined, undefined, // file headers
            { context: 0 } // options
        );
        const [parsedDiff] = parsePatch(diff);

        if (parsedDiff.hunks.length > 0) {
            await webhookClient.send(buildNotification(config.WATCH_NAME, parsedDiff.hunks));
        }

        cache.set(config.WATCH_NAME, html);
        console.log(`[${dayjs().toISOString()}] Stopped`);
    });
})();

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
