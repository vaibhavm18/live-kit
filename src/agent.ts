// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, WorkerOptions, cli, defineAgent, llm, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.AUTH_SUPABASE_URL;
const supabaseKey = process.env.AUTH_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL or key is not set');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    let { data, error } = await supabase
      .from('topics')
      .select('id, topic')
      .eq('id', ctx.room.name)
      .single();

    const hasTopic = !error && data?.topic;
    const topic = data?.topic;

    console.log('Topic', data);
    console.log('waiting for participant');

    const participant = await ctx.waitForParticipant();
    console.log(`starting assistant example agent for ${participant.identity}`);

    const model = new openai.realtime.RealtimeModel({
      instructions: `
        Act as a helpful tutor. Use natural, conversational language. 
        Focus on the student's curiosity. Ask open-ended questions.
        Keep responses concise and clear. 
        If the user asks a question, respond with a concise answer.
        First message should start with Hey, then ask about,
        ${hasTopic ? 'what question they have in this' + topic : 'What would you like to learn?'}
      `,
    });

    const fncCtx: llm.FunctionContext = {
      // weather: {
      //   description: 'Get the weather in a location',
      //   parameters: z.object({
      //     location: z.string().describe('The location to get the weather for'),
      //   }),
      //   execute: async ({ location }) => {
      //     console.debug(`executing weather function for ${location}`);
      //     const response = await fetch(`https://wttr.in/${location}?format=%C+%t`);
      //     if (!response.ok) {
      //       throw new Error(`Weather API returned status: ${response.status}`);
      //     }
      //     const weather = await response.text();
      //     return `The weather in ${location} right now is ${weather}.`;
      //   },
      // },
    };

    const agent = new multimodal.MultimodalAgent({ model, fncCtx });
    const session = await agent
      .start(ctx.room, participant)
      .then((session) => session as openai.realtime.RealtimeSession);

    const initialMessage = hasTopic
      ? `Let's explore ${topic}. What would you like to focus on first?`
      : `What subject would you like to dive into today?`;

    session.conversation.item.create(
      llm.ChatMessage.create({
        role: llm.ChatRole.ASSISTANT,
        text: initialMessage,
      }),
    );

    session.response.create();
  },
});

const port = 8081;

cli.runApp(
  new WorkerOptions({
    host: '0.0.0.0',
    agent: fileURLToPath(import.meta.url),
    port: Number(port),
  }),
);
