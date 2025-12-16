# **Technical Design Document: Discord Raffle Bot**

## **1\. Executive Summary**

This project involves building a Discord bot to manage the inputs, outputs, and state of community raffles (specifically for Pokémon cards/sealed items).  
**Core Philosophy:**

1. **Single Tenancy:** Only one active raffle is allowed at a time per server (Guild).  
2. **Management Only:** The bot handles claiming slots, tracking payments, and displaying status. It **does not** perform the RNG to pick the winner.  
3. **Role-Based Access:** High security on "Raffle Host" privileges.

## **2\. Roles & Permissions**

### **2.1 Admin (Server Owner/Admin)**

* **Capabilities:**  
  * Configure the "Raffle Host" role using `/admin set_host_role`.
  * Force close raffles (emergency).

### **2.2 Raffle Host**

* **Prerequisite:** Must have a specific Discord Role configured by the Admin.
* **Capabilities:**  
  * Run setup commands to configure payment methods and metadata.  
  * Create, Edit, and Close raffles.  
  * Claim slots on behalf of other users (Proxy Claiming).  
  * Configure payment triggers (Immediate vs. On-Fill).

### **2.3 User (Entrant)**

* **Capabilities:**  
  * View raffle status.  
  * Claim slots (subject to limits).  
  * Receive payment instructions via DM.

## **3\. Database Schema Design**

### **3.1 Users**

*Global table tracking unique Discord users.*

* user\_id (PK): Discord Snowflake ID.  
* username: Discord username.  
* display\_name: Server nickname/display name.  
* created_at: Timestamp.

### **3.2 GuildConfigs**

*Configuration per Discord Server.*

* guild_id (PK): String.
* raffle_host_role_id: String (Discord Role ID).

### **3.3 RaffleHosts**

*Extends Users. Stores configuration for users allowed to host.*

* host\_id (FK \-\> Users.user\_id).  
* commission\_rate: String/Float (e.g., "5%" or "$5").  
* allows\_local\_meetup: Boolean.  
* allows\_shipping: Boolean.  
* proxy\_claim\_enabled: Boolean.  
* default\_payment\_trigger: Enum (IMMEDIATE, ON\_FILL).

### **3.4 HostPaymentMethods**

*One-to-many relationship with RaffleHosts.*

* id (PK).  
* host\_id (FK \-\> RaffleHosts).  
* platform: Enum/String (Venmo, CashApp, PayPal, Zelle).  
* handle: String.  
* qr_code_url: String.

### **3.5 Raffles**

* raffle_id (PK).
* guild_id: String (Discord Server ID).
* raffle_code: String (Unique 8-char ID).
* winner_id: String (Discord User ID).
* host\_id (FK \-\> RaffleHosts).  
* status: Enum (PENDING, ACTIVE, CLOSED, CANCELLED).  
* item\_title: String.  
* item\_description: Text.  
* images: Array<String> (URLs).  
* market\_price: Decimal.  
* total\_slots: Integer.  
* cost\_per\_slot: Decimal (Calculated: (Price + Commission) / Slots).  
* max\_slots\_per\_user: Integer.  
* payment\_trigger: Enum (IMMEDIATE, ON\_FILL).  
* created_at: Timestamp.
* close_timer: Timestamp.

### **3.6 Slots**

* id (PK).
* raffle_id (FK -> Raffles).  
* slot\_number: Integer.  
* claimant\_id: (FK \-\> Users.user\_id).  
* claimed\_at: Timestamp.  
* payment\_status: Enum (PENDING, PAID).

## **4\. Command Structure (Slash Commands)**

### **4.1 Host Configuration**

Group: /host

* **/host setup**  
  * **Action:** Configures host profile (Commission, Meetups, etc.).
* **/host payment add/remove**  
  * **Action:** Manage payment handles.
* **/host info**
  * **Action:** View a host's profile and payment methods.

### **4.2 Raffle Management**

Group: /raffle

* **/raffle create**  
  * **Action:** Starts the "Raffle Wizard".
  * **Input:** Title + Image (Required).
  * **Flow:** 
    1. Command creates a "PENDING" raffle.
    2. Bot returns a Modal requesting: Description, Market Price, Total Slots, Max Claims.
    3. Host submits Modal.
    4. Bot calculates costs (Banker's Rounding) and shows an ephemeral Confirmation Message.
    5. Host clicks "Confirm" -> Raffle becomes "ACTIVE" and public embed is posted.
* **/raffle close**  
  * **Action:** Closes the active raffle.
* **/raffle update**  
  * **Action:** Update settings (e.g., max slots) for the active raffle.
* **/raffle status**  
  * **Action:** Displays the status of the active raffle.
  * **Optional:** Provide `raffle_code` to view a historic raffle.
* **/raffle list**
  * **Action:** Displays a paginated history of previous raffles (ID, Title, Winner, Price, Date).
* **/raffle participants**
  * **Action:** Lists all entrants and their slot counts.
* **/raffle pick_winner**
  * **Action:** Randomly selects a winner from claimed slots, closes the raffle, and announces the result.

### **4.3 Interaction & Claims**

* **/claim**  
  * **Inputs:** quantity (Integer).  
  * **Logic:**  
    1. Check raffle status.
    2. Check max slots per user.
    3. Auto-assign the next available slot numbers.
    4. **Notify:** If payment trigger is IMMEDIATE, DM the user with the total due and payment handles.

## **5\. Key Logic & Workflows**

### **5.1 Single Active Raffle Enforcer**

Raffles are scoped by `guild_id`. Only one `ACTIVE` raffle is allowed per Guild.

### **5.2 Pricing & Commission**

* **Commission:** Parsed from Host Profile (e.g., "5%").
* **Total Value:** Market Price + Commission.
* **Slot Price:** Total Value / Total Slots (Rounded to nearest whole number via Banker's Rounding).

### **5.3 Claims**

* **Auto-Assign:** Users request a *quantity* of slots. The bot assigns the lowest available numbers.
* **Concurrency:** Database constraints prevent duplicate claims on the same slot number.

## **6\. Implementation Notes**

1. **Images:** Stored as an array of URLs.
2. **Modals:** Used for the main data entry to overcome Slash Command limits.
3. **Components:** Buttons used for final confirmation (Create/Cancel).
