# Business & Sales — Buyer Intent Radar + Retail Placement Engine

## Goal
Find businesses that are actively looking for bakery supply or are showing a strong near-term buying signal, rank them, match appropriate products, and move only qualified leads into a human-approved sales pipeline.

## Source policy
Use public business-intent information unless a connected authorized source is explicitly available. Do not scrape private groups/messages or infer sensitive personal traits.

## High-signal phrases
Thai examples:
- หาซัพพลายเออร์เบเกอรี่
- หาขนมลงร้าน
- รับเบเกอรี่มาขาย
- รับฝากขายขนม
- กำลังเปิดคาเฟ่
- soft opening / opening soon
- หา supplier ร้านกาแฟ

English examples:
- looking for bakery supplier
- bakery supplier needed
- cafe opening soon
- wholesale bakery supplier

## Intent bands
- HOT 90–100: explicit supplier/product need now
- WARM 70–89: opening/soft-opening/menu-build signal
- SIGNAL 50–69: new/expanding store, product gap, weaker evidence
- <50: low priority

## Lead fields
- public business/store name
- source URL
- source timestamp
- location
- exact need / public signal
- public business contact channel if present
- intent score + reason
- recommended Candy products from canonical Product Master
- contacted/not-contacted state
- do-not-contact state

## Workflow
DISCOVER -> DEDUPE -> ENRICH -> INTENT SCORE -> PRODUCT MATCH -> COMMERCIAL CHECK -> HUMAN REVIEW -> APPROVE CONTACT -> OUTREACH -> SAMPLE -> NEGOTIATE -> ACTIVE -> REORDER -> LEARN

## Retail Fit Score v0.1 / 100
- category fit 20
- customer / price fit 15
- bakery gap / complementary assortment 15
- distance / delivery efficiency 15
- popularity / demand signal 10
- contactability 10
- hours fit 5
- product-specific fit 5
- historical similarity 5

## Commercial models
- Wholesale
- Consignment
- Revenue share
- OEM / White label

## Safety and quality rules
- never fabricate a contact, post, date, location, price, or buyer intent
- keep source provenance on every lead
- dedupe before outreach
- first outbound contact requires Human Approval
- honor do-not-contact/unsubscribe state
- audit outbound actions
