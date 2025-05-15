import { SearchMode, Tweet } from "agent-twitter-client";
import { composeContext, elizaLogger, getGoals, Goal, removeGoal, stringToUuid } from "@ai16z/eliza";
import { generateMessageResponse } from "@ai16z/eliza";
import { messageCompletionFooter } from "@ai16z/eliza";
import {
    Content,
    HandlerCallback,
    IAgentRuntime,
    ModelClass,
    Memory,
    State,
} from "@ai16z/eliza";
import { ClientBase } from "./base";
import { sendTweet, wait } from "./utils.ts";

const giveawayWinnersTemplate = (winners: string[]) =>
    `# INSTRUCTIONS: Respond using the information of the post with the winners. Compose a message listing the winners.

    Winners: ${winners}

    Information:
    {{currentPost}}

    Be careful not to misspell any of the winners and ensure there is an '@' prefixing their name. Just put your response formatted into a json with key text.
    So put it into the text field in json:
    `+ messageCompletionFooter;

export class TwitterGiveawayClient {
    client: ClientBase;
    runtime: IAgentRuntime;
    twitterUsername: string;
    private respondedTweets: Set<string> = new Set();

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.client = client;
        this.runtime = runtime;
        this.twitterUsername = runtime.getSetting("TWITTER_USERNAME");
    }

    async start() {
        this.checkGiveawaysLoop();
    }


    private checkGiveawaysLoop() {
        this.checkGiveaways();
        setTimeout(
            () => this.checkGiveawaysLoop(),
            Number(60 * 20) * 1000 // Default to 30 minutes
        );
    }

    private async checkGiveaways() {
        elizaLogger.log("Checking giveaways every 30 min...");

        const goals : Goal[] = await getGoals({
            runtime: this.runtime,
            roomId: stringToUuid("placeholder"),
            onlyInProgress: true,
            count: 30
        });

        for(const goal of goals) {
            elizaLogger.log(JSON.stringify(goal.objectives, null, 2));
            elizaLogger.log(JSON.stringify(goal, null, 2));

            let goalId = goal.id;
            let giveawayTweetId = goal.name;
            elizaLogger.log("Processing giveaway "+giveawayTweetId);

            if (goal?.objectives?.[0]?.description &&
                goal?.objectives?.[1]?.description) {
                // objectives data
                let giveawayTweetTimeEnd: Date = new Date(goal.objectives[0].description);
                let giveawayAmount: number = parseInt(goal.objectives[1].description,10);
                let now = new Date();
                elizaLogger.log("Time now: "+now);
                elizaLogger.log("Time end: "+giveawayTweetTimeEnd);
                if (now > giveawayTweetTimeEnd) {
                    let tweet:Tweet = await this.client.getTweet(goal.name);
                    // let thread:Tweet[] = await buildConversationThread(tweet, this.client, 1000);
                    const allTweetsResponse = await this.client.fetchSearchTweets(
                        `conversation_id:${goal.name} -is:retweet`,
                        100,               // or however many you need to fetch (may need pagination)
                        SearchMode.Latest, // your custom search mode
                    );
                    let thread: Tweet[] = allTweetsResponse.tweets;
                    // const replyContext = replies
                    //     .filter((reply) => reply.username !== tweet.username)
                    //     .map((reply) => `@${reply.username}: ${reply.text}`)
                    //     .join("\n");

                    elizaLogger.log(JSON.stringify(thread, null, 2));
                    let randomWinners: string[] = this.pickRandomUsernames(thread, giveawayAmount);

                    if (tweet != null && tweet.text != null) {
                        const message = {
                            content: { text: tweet.text, winners: randomWinners },
                            agentId: this.runtime.agentId,
                            userId: goal.userId,
                            roomId: goal.roomId
                        };

                        // tweet winners
                        this.handleTweet({tweet,message, winners: randomWinners});

                        // delete goal
                        removeGoal({
                            runtime: this.runtime,
                            goalId
                        });
                        elizaLogger.log("Giveaway ended: "+ goalId);
                    } else {
                        elizaLogger.log("NULL GIVEAWAY!");
                    }
                } else {
                    elizaLogger.log(giveawayTweetId);
                    elizaLogger.log("Giveaway not ended yet...");
                }
            }
        }
    }

    private pickRandomUsernames(thread: Tweet[], x: number): string[] {
        // 1. Extract usernames from each tweet (filter out undefined or null).
        const allUsernames = thread
          .filter((t) => t.username !== this.twitterUsername)
          .map((t) => t.username)
          .filter((username): username is string => !!username); // Type guard for non-empty

        const uniqueUsernames = Array.from(new Set(allUsernames));

        elizaLogger.debug(uniqueUsernames);
        // 2. Shuffle the array of usernames (Fisher-Yates / Durstenfeld shuffle is ideal, but a quick approach is):
        const shuffledUsernames = this.fisherYatesShuffle(uniqueUsernames);

        // 3. Return the first `x` items from the shuffled array (or all if x is larger).
        return shuffledUsernames.slice(0, x);
    }

    private fisherYatesShuffle<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
          // Pick a random index from 0 to i
          const j = Math.floor(Math.random() * (i + 1));

          // Swap elements array[i] and array[j]
          [array[i], array[j]] = [array[j], array[i]];
        }

        return array;
    }

    private async handleTweet({
        tweet,
        message,
        winners,

    }: {
        tweet: Tweet;
        message: Memory;
        winners: string[];
    }) {
        if (tweet.userId === this.client.profile.id) {
            // console.log("skipping tweet from bot itself", tweet.id);
            // Skip processing if the tweet is from the bot itself
            return;
        }

        if (!message.content.text) {
            elizaLogger.log("Skipping Tweet with no text", tweet.id);
            return { text: "", action: "IGNORE" };
        }

        elizaLogger.log("Processing Tweet: ", tweet.id);
        const formatTweet = (tweet: Tweet) => {
            return `  ID: ${tweet.id}
        From: ${tweet.name} (@${tweet.username})
        Text: ${tweet.text}`;
        };
        const currentPost = formatTweet(tweet);

        let state = await this.runtime.composeState(message, {
            twitterClient: this.client.twitterClient,
            twitterUserName: this.runtime.getSetting("TWITTER_USERNAME"),
            currentPost,
        });

        if (winners.length == 0) {
            elizaLogger.log("NO WINNERS FOUND ??? "+ tweet.id);
            return;
        }

        const context = composeContext({
            state,
            template: giveawayWinnersTemplate(winners),
        });

        elizaLogger.debug("Giveaways prompt:\n" + context);

        const response = await generateMessageResponse({
            runtime: this.runtime,
            context,
            modelClass: ModelClass.LARGE,
        });

        const removeQuotes = (str: string) =>
            str.replace(/^['"](.*)['"]$/, "$1");
        const stringId = stringToUuid(tweet.id + "-" + this.runtime.agentId);

        response.inReplyTo = stringId;
        response.text = removeQuotes(response.text);

        if (response.text) {
            try {
                const callback: HandlerCallback = async (response: Content) => {
                    const memories = await sendTweet(
                        this.client,
                        response,
                        message.roomId,
                        this.runtime.getSetting("TWITTER_USERNAME"),
                        tweet.id
                    );
                    return memories;
                };

                const responseMessages = await callback(response);

                state = (await this.runtime.updateRecentMessageState(
                    state
                )) as State;

                for (const responseMessage of responseMessages) {
                    if (
                        responseMessage ===
                        responseMessages[responseMessages.length - 1]
                    ) {
                        responseMessage.content.action = response.action;
                    } else {
                        responseMessage.content.action = "CONTINUE";
                    }
                    await this.runtime.messageManager.createMemory(
                        responseMessage
                    );
                }

                await this.runtime.processActions(
                    message,
                    responseMessages,
                    state,
                    callback
                );

                const responseInfo = `Context:\n\n${context}\n\nSelected Post: ${tweet.id} - ${tweet.username}: ${tweet.text}\nAgent's Output:\n${response.text}`;

                await this.runtime.cacheManager.set(
                    `twitter/tweet_generation_${tweet.id}.txt`,
                    responseInfo
                );
                await wait();
            } catch (error) {
                elizaLogger.error(`Error sending response tweet: ${error}`);
            }
        }
    }

}