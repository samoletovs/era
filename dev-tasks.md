# Dev tasks

User feedback from the ERA app. Last synced: 2026-03-23T19:25:05.963Z.

Run `npm run dev-tasks` to refresh. Total: 28 (0 open, 0 in-progress, 28 resolved).

<!-- TASKS_START -->

## Resolved

- [x] ~~Navigation part on the left cannot be strolled. So I cannot see settings menu item on mobile.~~  
  _Page: /contacts · 23/03/2026 · done_
- [x] ~~Why buttons have a different color on the accounting form. Please fix.~~  
  _Page: /accounting · 23/03/2026 · done_
- [x] ~~Description somehow to big and grid do not fit to the mobile phone, take inspiration from the invoices. And improve the grid in journals form~~  
  _Page: /journal · 23/03/2026 · done_
- [x] ~~There is no option to add budget, investigate what other erp do and make this experience as simple as possible for the user, with maximum automation.~~  
  _Page: /reports · 23/03/2026 · done_
- [x] ~~Ar and so aging probably do not require date, it is on today’s date propably, not sure check from accounting perspective, what should be here~~  
  _Page: /reports · 23/03/2026 · done_
- [x] ~~Maybe credit column on trial balance should be with minus? Not sure, how it should be from accounting or accountant perspective?~~  
  _Page: /reports · 23/03/2026 · done_
- [x] ~~Reports should show by default this month~~  
  _Page: /reports · 23/03/2026 · done_
- [x] ~~We need to think how to show GL posting in a better manner, it is a bit messy now and difficult to read. It should be universal control that we will use everywhere, on items, contacts, banks, invoices, etc.. it should look good on mobile as well.~~  
  _Page: /fixed-assets · 23/03/2026 · done_
- [x] ~~Maybe selection of the period, should filer the grid and show only fixed assets that were acquired in that period or before?~~  
  _Page: /fixed-assets · 23/03/2026 · done_
- [x] ~~Fixed asset grid do not fit to mobile, maybe we should  show less colums for mobile~~  
  _Page: /fixed-assets · 23/03/2026 · done_
- [x] ~~On mobile it is hard to se transactions, maybe show only date and amount colums, or maybe think about different way to show the transactions.~~  
  _Page: /accounts · 23/03/2026 · done_
- [x] ~~Is entry is the is of the transaction? Please ensue that rhetorical numbering will continue to work if we will have a lot of transactions per day.~~  
  _Page: /accounts · 23/03/2026 · done_
- [x] ~~Clicking on item do not open item details and do not show transactions with this item~~  
  _Page: /items · 23/03/2026 · done_
- [x] ~~Items grid do not fit to mobile screen~~  
  _Page: /items · 23/03/2026 · done_
- [x] ~~Interesting, I’m creating invoices for a new customers , but it is not adding them to the contacts. I believe it should first create them as contacts and find all mandatory information. Buy the way for contacts for other counties we need to find another source of information, I believe it should be public registers for EU companies. For third countries, I’m not sure, but we need to incorporate them somehow as well.~~  
  _Page: /invoices · 23/03/2026 · done_
- [x] ~~Describe invoice option do not look good on the mobile, and recording do not update description.~~  
  _Page: /invoices · 23/03/2026 · done_
- [x] ~~Try to fit lines, and postings to the mobile screen~~  
  _Page: /invoices · 23/03/2026 · done_
- [x] ~~Credit note should provide the option to create corrected invoice, for example if price was incorrect then it should reverse original invoice and create a new one with corrected price. Maybe we should use our universal input, asking to describe the reason for correction, user can record it using voice, it will be transcribed to text, and besed on it the correction invoice will be created.~~  
  _Page: /invoices · 23/03/2026 · done_
- [x] ~~Maybe we do not need a button pay invoice, as we have individual buttons on each invoice.~~  
  _Page: /invoices · 23/03/2026 · done_
- [x] ~~Invoices grid do not fit to mobile screen, maybe for mobile we need to have different grid? Please check yourself and implement solution.~~  
  _Page: /invoices · 23/03/2026 · done_
- [x] ~~About the company names, official registered name
Is not always looking good in interface it can have some prefix, or it is to long, etc. would be good to add a short name or known as name, you can decide how to call it. This will represent a shot nice looking name that we can recognize the company. when import information from registers propose a nice name. It relates to contacts and to the companies. Please add and update existing records. In company selection - this short or knows as name should be shown.~~  
  _Page: / · 23/03/2026 · done_
- [x] ~~If we remove account type from the grid we might be able to fit accounts and balances on one screen on mobile. You can show it in web, but on mobile probably not. If you cannot differentiate, remove on both web and mobile. Test how it looks on mobile and try to fit.~~  
  _Page: /accounts · 23/03/2026 · done_
- [x] ~~Cannot see manual reconciliation option in bank, I think we added it, no?~~  
  _Page: /bank · 23/03/2026 · done_
- [x] ~~Send feedback form not looking and working well on the phone, please fix~~  
  _Page: /accounting · 23/03/2026 · done_
- [x] ~~Multi currency support needs to be added, please investigate the best pactisesnun other major  erps how to do it. In fno for example there are 3 currencies transaction, accounting and reporting. All 3 can have different exchange rates, setup manually or imported. We need to enable automatic import from European Central Bank and Latvian central bank. I believe this exchange rates can be shared between companies and even between users. Hover there should be option to create company specific exchange rates and group exchange rates that can be shared between multiple companies. Think about the best way to organize this. Currency revaluation should be part of the month end close process.~~  
  _Page: /accounting · 23/03/2026 · done_
- [x] ~~VAT return do not have menu item, add it to the accounting, similar to month end close. Allowing to run it for a current month and showing the history and status of the previous months~~  
  _Page: /accounting · 23/03/2026 · done_
- [x] ~~The possibility to enter data using AI should be universal and available on every form that allow data entry or correction. It should have text where user can enter information, button to record this information any translate to text, and button to fill the data/fields. So we need to make such control universal that can work in content with the data. Currently we have it on items. But slew should be enable to use the sesame control on invoices, fixed assets, contacts, etc..~~  
  _Page: /recurring · 23/03/2026 · done_
- [x] ~~Recurring entries we need to transform to entries, with the option to make them recurring. You should be able to make it not only between ledger accounts, but using customers and vendors bank and fixed assets.~~  
  _Page: /recurring · 23/03/2026 · done_

<!-- TASKS_END -->
