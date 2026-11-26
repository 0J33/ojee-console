# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner of the machines it controls. He uses it alone, on a desktop monitor, a laptop and his phone, to see whether everything he runs at home is healthy and to act on it. There are no other users and no shared or public access.

## Product Purpose

console.ojee.net is a personal control console. It gathers independent modules (Machines, Claude, Network, Home, Peripherals) into one app: each module reports its own status and numbers, and the console's home page answers "what needs me, and is everything else all right" before anything else. Success is a glance: open it, see the Needs-you list, then one dense row per system, go straight to the one that needs attention.

## Positioning

Local control, no cloud. It runs on the owner's own hardware, is reachable only over his tailnet, and every screen comes from a module he wrote and deploys himself.

## Operating Context

- Glanced at from a desk (1920×1080), a portrait monitor (1080×1920) and a phone (390 wide); dark is the usual setting, light is used in daylight.
- Modules: Machines (LOQ, HP, disinteg — hosts, services, screen/shell/files), Claude (sessions, accounts), Network (5G router), Home (the AC), Peripherals (mouse, keyboard, headphones; served from the LOQ, so it is offline whenever the laptop sleeps).

## Capabilities and Constraints

- Tailnet-only, TOTP login, 30-day device trust.
- The console owns chrome, routing, auth and the one inbox; modules own their screens and report `/api/summary` (status, headline, metrics, spark, rows, alerts, quick-action state).
- Overview = layout A: Needs-you (the inbox) first, then one row per system with up to four numbers and a 2-hour sparkline; quick actions are one tap on the row and in ⌘K.
- Nav never disappears: a sidebar at ≥1200px, a top bar and five bottom tabs below (More holds the rest).
- Notifications: one item per stable key, hold-to-raise and clear-to-resolve, toasts and push only for blocking items, everything else inbox and badge, quiet hours 23:00–07:30, every alert kind configurable in Settings.
- One design system, ojee-ui v3, copied into each consumer; modules add only their own CSS.
- No 3D, no clock/watch features.

## Brand Commitments

- Name and wordmark: "ojee.console" (`ojee` + accent `.` + `console`, Geist Mono).
- Modern tech product (Vercel / Linear / Cloudflare grade): Geist for UI, Geist Mono tabular for numbers, IDs and times; neutral greys, hairlines, 6–8px radius; one electric-cyan accent; colour otherwise only for status (ok, warn, err). Dark is the hero.
- Lucide-style line icons from one sprite; no emoji or glyphs standing in for icons.

## Evidence on Hand

- Real module summaries exist and can be read from the live console; demos and concepts use synthetic data shaped like them and must say so.
- No screenshots, testimonials or metrics beyond what the modules themselves report.

## Product Principles

1. The first screen answers "is everything all right" before it shows anything else.
2. Say what is measured, not what is assumed: status, time and accuracy are stated with their source.
3. Something wrong outranks everything decorative.
4. One system across every module: a module never looks like a different product.
