# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner of the machines it controls. He uses it alone, on a desktop monitor, a laptop and his phone, to see whether everything he runs at home is healthy and to act on it. There are no other users and no shared or public access.

## Product Purpose

console.ojee.net is a personal control console. It gathers independent modules (Home, Fleet, Remote, Agent) into one app: each module reports its own status and headline facts, and the console's home page answers "is everything all right, and what needs me" before anything else. Success is a glance: open it, know the state of every system, go straight to the one that needs attention.

## Positioning

Local control, no cloud. It runs on the owner's own hardware, is reachable only over his tailnet, and every screen comes from a module he wrote and deploys himself.

## Operating Context

- Glanced at across a room, from a desk, and on a phone; sometimes left open full-screen on a laptop's IPS display as an idle clock and status board.
- The home page carries an NTP-referenced clock used to set a mechanical watch, so the time shown must be exact to the second and say how exact it is.
- Modules: Home (air conditioner, temperature, presence, scenes, automations), Fleet (hosts and services on the owner's machines), Remote (remote desktop, shell and files for his devices), Agent (workflows, the Odysseus assistant, the service stack).

## Capabilities and Constraints

- Tailnet-only, TOTP login, 30-day device trust.
- The console owns chrome, routing and auth; modules own their own screens and CSS and report `/api/summary` (status, headline, facts, alerts).
- One design system, ojee-ui, copied into each consumer; themes redefine tokens and never rules.
- Icons are one generated Material Symbols Outlined set; no emoji or glyphs standing in for icons.

## Brand Commitments

- Name and wordmark: "ojee.console" (`ojee` + accent `.` + `console`), tagline "local control · no cloud".
- The existing identity: cyan on near-black, all-monospace (Geist Mono, Departure Mono for HUD micro-type, Major Mono Display for the wordmark), zero radius, one accent, shared with the ojee.net sites.

## Evidence on Hand

- Real module summaries exist and can be read from the live console; demos and concepts use synthetic data shaped like them and must say so.
- No screenshots, testimonials or metrics beyond what the modules themselves report.

## Product Principles

1. The first screen answers "is everything all right" before it shows anything else.
2. Say what is measured, not what is assumed: status, time and accuracy are stated with their source.
3. Something wrong outranks everything decorative.
4. One system across every module: a module never looks like a different product.
