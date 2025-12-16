import { REST } from 'npm:@discordjs/rest';
import { Routes } from 'npm:discord-api-types/v10';
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const token = Deno.env.get('DISCORD_BOT_TOKEN') || Deno.env.get('DISCORD_TOKEN');
const appId = Deno.env.get('DISCORD_APP_ID');

if (!token || !appId) {
  console.error("Error: DISCORD_BOT_TOKEN (or DISCORD_TOKEN) and DISCORD_APP_ID must be set in your .env file or environment variables.");
  Deno.exit(1);
}

const commands = [
  // /host setup
  // /host payment add/remove
  // /host info
  {
    name: 'host',
    description: 'Raffle Host Configuration',
    options: [
      {
        name: 'setup',
        description: 'Configure your hosting settings',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'commission',
            description: 'Your commission rate (e.g. "5%" or "$5")',
            type: 3, // STRING
            required: true
          },
          {
            name: 'local_meetup',
            description: 'Do you allow local meetups?',
            type: 5, // BOOLEAN
            required: true
          },
          {
            name: 'shipping',
            description: 'Do you offer shipping?',
            type: 5, // BOOLEAN
            required: true
          },
          {
            name: 'allow_proxy_claims',
            description: 'Will you claim slots for others?',
            type: 5, // BOOLEAN
            required: true
          }
        ]
      },
      {
        name: 'payment',
        description: 'Manage payment methods',
        type: 2, // SUB_COMMAND_GROUP
        options: [
          {
            name: 'add',
            description: 'Add a payment method',
            type: 1, // SUB_COMMAND
            options: [
              {
                name: 'platform',
                description: 'Payment platform',
                type: 3, // STRING
                required: true,
                choices: [
                  { name: 'Venmo', value: 'Venmo' },
                  { name: 'CashApp', value: 'CashApp' },
                  { name: 'PayPal', value: 'PayPal' },
                  { name: 'Zelle', value: 'Zelle' }
                ]
              },
              {
                name: 'handle',
                description: 'Your username/email/tag for this platform',
                type: 3, // STRING
                required: true
              }
            ]
          },
          {
            name: 'remove',
            description: 'Remove a payment method',
            type: 1, // SUB_COMMAND
            options: [
              {
                name: 'platform',
                description: 'Payment platform to remove',
                type: 3, // STRING
                required: true,
                choices: [
                  { name: 'Venmo', value: 'Venmo' },
                  { name: 'CashApp', value: 'CashApp' },
                  { name: 'PayPal', value: 'PayPal' },
                  { name: 'Zelle', value: 'Zelle' }
                ]
              }
            ]
          }
        ]
      },
      {
        name: 'info',
        description: 'View host profile and payment methods',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'user',
            description: 'The host to view (defaults to yourself)',
            type: 6, // USER
            required: false
          }
        ]
      }
    ]
  },
  
  // /raffle create/close/update/status
  {
    name: 'raffle',
    description: 'Manage raffles',
    options: [
      {
        name: 'create',
        description: 'Start a new raffle (Step 1)',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'title',
            description: 'Item title',
            type: 3, // STRING
            required: true,
          },
          {
            name: 'image',
            description: 'Main image of the item',
            type: 11, // ATTACHMENT
            required: true,
          }
        ],
      },
      {
        name: 'close',
        description: 'Close the current raffle (no more claims)',
        type: 1, // SUB_COMMAND
      },
      {
        name: 'status',
        description: 'View the status of a raffle',
        type: 1, // SUB_COMMAND
        options: [
            {
                name: 'raffle_code',
                description: 'View a specific past raffle by its ID code',
                type: 3, // STRING
                required: false
            }
        ]
      },
      {
        name: 'list',
        description: 'List previous raffles (History)',
        type: 1, // SUB_COMMAND
        options: [
            {
                name: 'page',
                description: 'Page number',
                type: 4, // INTEGER
                required: false
            }
        ]
      },
      {
        name: 'participants',
        description: 'View list of participants and their slots',
        type: 1, // SUB_COMMAND
      },
      {
        name: 'pick_winner',
        description: 'Pick a random winner from the slots (Closes raffle if active)',
        type: 1, // SUB_COMMAND
      },
      {
        name: 'update',
        description: 'Update the current raffle',
        type: 1, // SUB_COMMAND
        options: [
           {
            name: 'max_slots_per_user',
            description: 'Update max slots per user',
            type: 4, // INTEGER
            required: true
           }
        ]
      }
    ],
  },

  // /claim
  {
    name: 'claim',
    description: 'Claim slots in the active raffle',
    options: [
      {
        name: 'quantity',
        description: 'Number of slots to claim',
        type: 4, // INTEGER
        min_value: 1,
        required: true
      },
      {
        name: 'on_behalf_of',
        description: 'Proxy claim: Claim for another user (Hosts only)',
        type: 6, // USER
        required: false
      }
    ]
  },
  
  // /admin set_host_role
  {
    name: 'admin',
    description: 'Admin configuration for Raffler',
    default_member_permissions: '8', // ADMINISTRATOR
    options: [
      {
        name: 'set_host_role',
        description: 'Set the role required to create raffles',
        type: 1, // SUB_COMMAND
        options: [
          {
            name: 'role',
            description: 'The role to assign as Host Role',
            type: 8, // ROLE
            required: true
          }
        ]
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(token);

try {
  console.log('Started refreshing application (/) commands.');

  await rest.put(Routes.applicationCommands(appId), { body: commands });

  console.log('Successfully reloaded application (/) commands.');
} catch (error) {
  console.error(error);
}