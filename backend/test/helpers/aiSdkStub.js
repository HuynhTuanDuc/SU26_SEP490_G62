/**
 * Stub cho @google/generative-ai và @anthropic-ai/sdk.
 *
 * Hai package này được khai trong package.json nhưng KHÔNG có trong node_modules,
 * nên bất kỳ test nào chạm tới chatbotService (require ở dòng 1) sẽ crash lúc resolve.
 * jest.config.js map cả hai về file này.
 *
 * Mirror đúng phần API mà chatbotService dùng thật:
 *   new GoogleGenerativeAI(key).getGenerativeModel({...}).startChat().sendMessage()
 *   SchemaType.{OBJECT,STRING,...}
 * Test nào cần điều khiển phản hồi thì tự jest.mock('@google/generative-ai') riêng.
 */
const SchemaType = {
    OBJECT: 'object',
    STRING: 'string',
    NUMBER: 'number',
    INTEGER: 'integer',
    BOOLEAN: 'boolean',
    ARRAY: 'array',
};

class GoogleGenerativeAI {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    getGenerativeModel() {
        return {
            startChat: () => ({
                sendMessage: async () => ({
                    response: {
                        text: () => '',
                        functionCalls: () => [],
                    },
                }),
            }),
            generateContent: async () => ({
                response: { text: () => '', functionCalls: () => [] },
            }),
        };
    }
}

class Anthropic {
    constructor(options = {}) {
        this.apiKey = options.apiKey;
        this.messages = { create: async () => ({ content: [], stop_reason: 'end_turn' }) };
    }
}

module.exports = { GoogleGenerativeAI, SchemaType, Anthropic, default: Anthropic };
module.exports.default = Anthropic;
