# Kesi: Kenya Case Files — music brief

A brief to send to a composer (or to judge licensed tracks against). Kesi is a free iOS detective game set across Kenya: 100 murder cases solved by reading evidence at a police desk at night. The music sits under reading, so it must never compete with the text.

## What we need

| File | Plays under | Feel | Reference instruments (suggestions, not rules) |
|---|---|---|---|
| `cabinet.m4a` | The title screen and the filing cabinet | The theme. A desk lamp switching on, late night at a Nairobi police station. Patient, a little melancholy, curious | Nyatiti or acoustic guitar figure, upright or electric bass, soft brushes |
| `region-01.m4a` | Nairobi CBD (cases 1–10) | City at night: sodium streetlights, matatus idling, a radio somewhere | Benga-style clean guitar picked very quietly, bass, light shaker |
| `region-02.m4a` | Eastlands (11–20) | Dense neighbourhoods, mabati roofs, music from a shop down the road | Muted electric guitar, low synth pad, restrained drum machine |
| `region-03.m4a` | Mombasa Old Town (21–30) | Coral stone, the harbour, slow heat | Oud or qanun texture with taarab colour, frame drum |
| `region-04.m4a` | Rift Valley / Nakuru (31–40) | Red roads, wide valley, wind | Kalimba or thumb piano, long drones, sparse percussion |
| `region-05.m4a` | Kisumu and Lake Victoria (41–50) | Water, fishing boats at dusk | Nyatiti, ohangla-coloured drums kept very low |
| `region-06.m4a` | Maasai Mara (51–60) | Open savanna at night, distance | Low voices as texture only (no words), bells, drones |
| `region-07.m4a` | Mt Kenya / Nyeri (61–70) | Tea hills in mist, cold mornings | Fiddle or flute, soft guitar, rain-like textures |
| `region-08.m4a` | Northern frontier (71–80) | Basalt, heat, almost nothing | Very sparse: a single drum, wind, long silences |
| `region-09.m4a` | Westlands / Karen / Runda (81–90) | Glass towers, money, quiet menace | Electric piano, slow bass, cool pads |
| `region-10.m4a` | The Final Files (91–100) | The theme returns, heavier; the case that closes the story | The cabinet theme rearranged, fuller, building slowly |

Use the reference instruments as a starting point. A Kenyan composer's own judgement on what each place sounds like matters more than this table. The cultural reader hears every track before release.

## Technical

- **Loops:** 90 to 150 seconds each, seamless (the end flows into the start with no click or gap). The game loops them for as long as a case runs.
- **Under text:** no lead vocals, no lyrics, no sudden hits or big builds. Keep it in the background: about −20 LUFS integrated, peaks under −3 dBTP. The game lowers the music further while a character speaks.
- **Delivery:** 48 kHz WAV masters, plus AAC `.m4a` at 96–128 kbps stereo (or we convert). Name the files exactly as in the table.
- **Rights:** a written licence (or buyout) for worldwide use in the app, its trailers and its store pages, with no royalties per download and no Content ID claims against our own trailers. AI-generated music is not accepted unless its commercial rights are documented.

## Where the files go

Put the `.m4a` files in `www/audio/music/`, then list them in `www/audio/music/manifest.json`:

```json
{ "cabinet": "cabinet.m4a", "1": "region-01.m4a", "2": "region-02.m4a" }
```

A region with no track plays a quiet room tone instead (distant traffic, the lamp's hum), so tracks can arrive one at a time.
