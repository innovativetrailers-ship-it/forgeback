import type { ProbeSet } from './report-schema'

// 118 standardised CONSISTENCY BENCHMARK prompts — model-eval harness ONLY.
// Never auto-run in production. Requires triple-gate via intelligence/guards.ts.
// Trigger: intelligence-cron worker (DISABLED by default) or manual admin API.
export const PROBE_BATTERY: ProbeSet[] = [
  {
    category: 'physics_rigid_body',
    probes: [
      { id: 'PHY-001', prompt: 'A ceramic coffee mug falls from a table and shatters on a hardwood floor, debris scatters, dust rises', target: 'Does it understand gravity, impact physics, material fragmentation?' },
      { id: 'PHY-002', prompt: 'A basketball is thrown at a glass window, the glass cracks and shatters inward, the ball bounces back', target: 'Penetration physics, material response, energy transfer' },
      { id: 'PHY-003', prompt: 'A stack of books topples sideways in slow motion, each book falls at slightly different angles', target: 'Multi-object rigid body, domino physics' },
      { id: 'PHY-004', prompt: 'A bowling ball rolls down a lane and strikes all ten pins, pins scatter in realistic arcs', target: 'Collision physics, multi-body dynamics, energy dispersal' },
      { id: 'PHY-005', prompt: 'A glass marble rolls off a table, bounces three times on the floor, each bounce lower than the last', target: 'Elastic collision, energy loss, trajectory prediction' },
      { id: 'PHY-006', prompt: 'An axe swings down and splits a log cleanly, two halves fly apart, splinters scatter', target: 'Cutting physics, wood grain fracture, force direction' },
      { id: 'PHY-007', prompt: 'A rubber ball is thrown against a brick wall and bounces back at the correct angle', target: 'Angle of incidence/reflection, elastic deformation' },
      { id: 'PHY-008', prompt: 'A tower of stacked coins topples when the bottom coin is flicked away', target: 'Gravitational stability, domino cascade, inertia' },
      { id: 'PHY-009', prompt: 'A pendulum swings left to right with correct arc and gradually decreasing amplitude', target: 'Pendulum physics, damping, energy conservation' },
      { id: 'PHY-010', prompt: 'A car crashes into a concrete barrier at highway speed, crumple zones collapse, debris flies', target: 'Large-scale impact, structural deformation, energy absorption' },
    ],
  },

  {
    category: 'physics_fluid',
    probes: [
      { id: 'FLD-001', prompt: 'A wine glass is slowly tipped and red wine pours out, splashing on white linen tablecloth, staining it', target: 'Liquid flow, surface tension, material absorption' },
      { id: 'FLD-002', prompt: 'Heavy rain falls on a calm lake, each raindrop creates a perfect circular ripple, ripples intersect', target: 'Fluid wave physics, interference patterns' },
      { id: 'FLD-003', prompt: 'Thick honey pours from a spoon in a steady stream, slowly pooling and spreading, catching light', target: 'Non-Newtonian fluid, viscosity, light caustics' },
      { id: 'FLD-004', prompt: 'A wave crashes on a rocky shore, sea foam forms and recedes, spray rises and falls', target: 'Ocean wave dynamics, foam physics, spray particles' },
      { id: 'FLD-005', prompt: 'Water boils in a glass pot, bubbles forming on the bottom and rising, steam forming above', target: 'Phase change, convection currents, steam behaviour' },
      { id: 'FLD-006', prompt: 'Coffee is poured into a cup of cream, the two liquids mix and swirl in slow motion', target: 'Miscible fluid mixing, density gradients, Rayleigh-Taylor' },
      { id: 'FLD-007', prompt: 'A waterfall drops into a plunge pool, churning white water and mist at the base', target: 'High-energy fluid dynamics, aeration, mist particles' },
      { id: 'FLD-008', prompt: 'Ink drops fall into clear water in slow motion, spreading in fractal patterns', target: 'Diffusion physics, ink turbulence, 3D spreading' },
      { id: 'FLD-009', prompt: 'A river of lava flows slowly over dark rock, cooling and crusting at the edges', target: 'High-viscosity flow, thermal cooling, crust formation' },
      { id: 'FLD-010', prompt: 'A soap bubble floats in sunlight, iridescent colours shift, then it pops and collapses', target: 'Surface tension, thin-film interference, collapse physics' },
    ],
  },

  {
    category: 'human_motion',
    probes: [
      { id: 'HUM-001', prompt: 'A pianist plays a rapid difficult passage, fingers moving independently across keys, close-up of hands only', target: 'Fine motor control, finger independence, hand anatomy' },
      { id: 'HUM-002', prompt: 'A dancer performs a slow pirouette, arms extended, dress spinning outward, bare feet on wooden floor', target: 'Rotational physics on cloth, balance, foot positioning' },
      { id: 'HUM-003', prompt: 'Two boxers exchange rapid punches in slow motion, sweat drops fly, bodies react to impact', target: 'Fast action, impact physics, two-person coordination' },
      { id: 'HUM-004', prompt: 'A basketball player performs a slam dunk in slow motion, hang time visible, ball meeting rim', target: 'Athletic biomechanics, hang time, multi-limb coordination' },
      { id: 'HUM-005', prompt: 'A surgeon makes precise incisions with a scalpel, hands absolutely steady, gloved fingers close-up', target: 'Extreme precision, hand steadiness, clinical movement' },
      { id: 'HUM-006', prompt: 'A child runs down a hill laughing, arms waving, slightly stumbling, natural gait', target: 'Natural child biomechanics, informal motion, emotional expression' },
      { id: 'HUM-007', prompt: 'An elderly man slowly rises from a chair, knees giving slightly, steadying on armrests', target: 'Age-appropriate motion, joint limitation, muscle effort visible' },
      { id: 'HUM-008', prompt: 'A violinist performs in close-up, bow arm stroke, vibrato in left hand, intense expression', target: 'Instrument-specific motion, fine motor detail, performance capture' },
      { id: 'HUM-009', prompt: 'A woman types rapidly on a keyboard, fingers moving fluidly, wrists raised slightly', target: 'Typing biomechanics, hand position accuracy, speed' },
      { id: 'HUM-010', prompt: 'A tightrope walker crosses a gorge, arms balancing, body swaying slightly, focused expression', target: 'Balance physics, micro-correction motion, fear response' },
    ],
  },

  {
    category: 'text_accuracy',
    probes: [
      { id: 'TXT-001', prompt: 'A neon sign reading "OPEN 24HR" glows in a dark window, rain reflects it on wet pavement below', target: 'Text legibility under atmospheric conditions' },
      { id: 'TXT-002', prompt: 'A close-up of a newspaper front page with the headline "SCIENTISTS DISCOVER NEW PLANET" in bold type', target: 'Static text legibility, layout accuracy' },
      { id: 'TXT-003', prompt: 'A digital scoreboard showing "HOME 42 - AWAY 17" at a sports stadium, crowd in background', target: 'Numbers, multi-item text, context accuracy' },
      { id: 'TXT-004', prompt: 'A street sign clearly showing "MAIN ST" mounted on a post in an American city', target: 'Short text legibility, real-world context' },
      { id: 'TXT-005', prompt: 'A book cover with title "THE LAST VOYAGE" in elegant serif font on a dark background', target: 'Title-style text, typography quality' },
      { id: 'TXT-006', prompt: 'A restaurant menu board showing "TODAY\'S SPECIAL: GRILLED SALMON $28" in chalk lettering', target: 'Chalk-style text, menu format, price legibility' },
      { id: 'TXT-007', prompt: 'A highway road sign reading "CITY CENTER 5 MILES" in white on green, daylight', target: 'High-contrast text on colour background, standard signage' },
      { id: 'TXT-008', prompt: 'A vintage typewriter typing the word "CLASSIFIED" on white paper', target: 'Animated text formation, typewriter mechanics, letter accuracy' },
      { id: 'TXT-009', prompt: 'A phone screen showing a text message that reads "On my way home now"', target: 'Small screen text, SMS UI, legibility at angle' },
      { id: 'TXT-010', prompt: 'A graffiti tag reading "KING" spray-painted in large letters on a brick wall', target: 'Stylised text, urban context, paint texture on text' },
    ],
  },

  {
    category: 'consistency',
    probes: [
      { id: 'CON-001', prompt: 'A woman with short red hair and a blue coat walks from left to right across the frame, camera tracks her at mid-shot for 8 seconds', target: 'Character appearance stability across duration' },
      { id: 'CON-002', prompt: 'A candle flame burns steadily on a wooden table, no wind, camera holds static for 8 seconds', target: 'Environmental stability, subtle organic motion' },
      { id: 'CON-003', prompt: 'A red sports car drives continuously through a tunnel, the car must maintain identical appearance throughout', target: 'Object consistency across motion and lighting change' },
      { id: 'CON-004', prompt: 'A golden retriever sits and pants on a porch, camera holds static for 8 seconds, dog remains same', target: 'Animal appearance consistency, ambient motion' },
      { id: 'CON-005', prompt: 'A still life of a bowl of fruit on a table, camera holds 8 seconds, no objects change position', target: 'Static scene stability, zero-motion consistency' },
      { id: 'CON-006', prompt: 'A man with a beard and grey suit gives a speech at a podium for 8 seconds, appearance stable', target: 'Speaking character consistency, lip movement, appearance' },
      { id: 'CON-007', prompt: 'A grandfather clock ticks from 3:00 to 3:08, the minute hand must move correctly', target: 'Mechanical consistency, time accuracy, object state change' },
      { id: 'CON-008', prompt: 'A lighthouse beam rotates through full cycles for 8 seconds, always same speed and brightness', target: 'Cyclic motion consistency, light behaviour' },
      { id: 'CON-009', prompt: 'A campfire burns for 8 seconds, the logs must not change size or position, only flame varies', target: 'Partial stability — fire varies, surroundings constant' },
      { id: 'CON-010', prompt: 'The same face appears at 0s, 4s, and 8s in three different lighting conditions but unchanged features', target: 'Identity preservation across lighting variation' },
    ],
  },

  {
    category: 'material_physics',
    probes: [
      { id: 'MAT-001', prompt: 'A silk blouse worn by a woman as she spins, fabric moving with air resistance and inertia, catching light', target: 'Cloth simulation, light interaction, specular highlights' },
      { id: 'MAT-002', prompt: 'A close-up of a blacksmith hammering glowing hot metal, sparks fly, metal deforms under impact', target: 'High-temperature material, particle emission, deformation' },
      { id: 'MAT-003', prompt: 'Frost slowly forming on a glass window, ice crystals growing outward in real time, close macro', target: 'Crystal growth physics, material state change, macro detail' },
      { id: 'MAT-004', prompt: 'A rubber glove is stretched then released, snapping back, wobbling slightly before settling', target: 'Elastic material, deformation and recovery, secondary motion' },
      { id: 'MAT-005', prompt: 'Candle wax drips slowly down the side of a lit candle, forming translucent rivulets', target: 'Viscous material flow, translucency, surface adhesion' },
      { id: 'MAT-006', prompt: 'A wet dog shakes itself dry, droplets spraying outward in slow motion, fur movement', target: 'Fur simulation, fluid-solid interaction, high-speed motion' },
      { id: 'MAT-007', prompt: 'A piece of paper is slowly torn in half, fibres visible at the tear edge, sound implied', target: 'Material failure, fibre structure, controlled destruction' },
      { id: 'MAT-008', prompt: 'Chrome exhaust pipes glow red-hot from engine heat, heat shimmer visible above them', target: 'Metal thermal response, heat haze, spectral emission' },
      { id: 'MAT-009', prompt: 'A fresh loaf of bread is sliced, steam escapes from the interior, crumb structure visible', target: 'Porous material interior, steam physics, texture detail' },
      { id: 'MAT-010', prompt: 'A drop of water falls on a lotus leaf and rolls off without wetting the surface', target: 'Hydrophobic surface physics, water bead behaviour' },
    ],
  },

  {
    category: 'atmosphere',
    probes: [
      { id: 'ATM-001', prompt: 'Dense fog rolls through a forest at dawn, shafts of light penetrate the mist, the forest is silent', target: 'Volumetric fog, light scatter, atmospheric depth' },
      { id: 'ATM-002', prompt: 'A lightning strike hits a tree during a violent storm, branches explode, thunder implied', target: 'Electrical arc physics, explosive impact, storm atmosphere' },
      { id: 'ATM-003', prompt: 'A sandstorm approaches a desert village, the wall of sand is 50 metres tall, people run', target: 'Particle systems at scale, environmental threat, crowd reaction' },
      { id: 'ATM-004', prompt: 'Snow falls gently on a quiet village at night, thick flakes catching streetlight, accumulating', target: 'Particle precipitation, light interaction, accumulation physics' },
      { id: 'ATM-005', prompt: 'A tornado touches down on a prairie, dust and debris spiral upward, trees bend violently', target: 'Rotational wind physics, debris physics, large-scale destruction' },
      { id: 'ATM-006', prompt: 'Early morning mist rises off a still lake surface in the first light of sunrise', target: 'Evaporation physics, thermal mist, soft light interaction' },
      { id: 'ATM-007', prompt: 'A wildfire burns through a hillside at night, embers drift upward on hot air, smoke billows', target: 'Large-scale fire, particle emission, thermal convection' },
      { id: 'ATM-008', prompt: 'Heat lightning flickers silently on the horizon behind dark mountains, no sound', target: 'Distant atmospheric electricity, subtle light effect, scale' },
      { id: 'ATM-009', prompt: 'The aurora borealis shimmers in curtains of green and violet over a frozen tundra at night', target: 'Luminous atmospheric phenomenon, colour gradients, movement' },
      { id: 'ATM-010', prompt: 'A hurricane makes landfall, palm trees horizontal, rain nearly horizontal, waves overwhelming a seawall', target: 'Extreme weather, compound atmospheric events, scale and chaos' },
    ],
  },

  {
    category: 'architecture',
    probes: [
      { id: 'ARC-001', prompt: 'A slow drone push-in toward the facade of a Gothic cathedral at dusk, stone texture detail, gargoyles', target: 'Camera movement + architecture detail + atmospheric lighting' },
      { id: 'ARC-002', prompt: 'Interior of a 1970s brutalist government building, fluorescent lights, worn linoleum, long hallway receding', target: 'Period-accurate architecture, perspective, interior lighting' },
      { id: 'ARC-003', prompt: 'A futuristic glass and steel skyscraper in a rainstorm at night, lights reflected in puddles below', target: 'Modern architecture, reflective materials, night atmosphere' },
      { id: 'ARC-004', prompt: 'The interior of the Pantheon in Rome, light beam from oculus sweeping across the floor', target: 'Classical architecture, accurate proportions, volumetric light' },
      { id: 'ARC-005', prompt: 'A traditional Japanese wooden temple in autumn, maple trees red and gold, stone path leading up', target: 'Period-specific cultural architecture, seasonal atmosphere' },
      { id: 'ARC-006', prompt: 'A cramped Victorian terraced street in London, cobblestones, gas lamps, fog, horse-drawn carriage passing', target: 'Historical accuracy, period atmosphere, urban density' },
      { id: 'ARC-007', prompt: 'An abandoned warehouse interior, broken windows, shafts of dusty light, graffiti on walls', target: 'Decay aesthetics, dust particle effects, light through glass' },
      { id: 'ARC-008', prompt: 'A luxury hotel lobby, marble floors, gold fixtures, enormous flower arrangement, guests crossing', target: 'Opulent interior, material rendering, ambient human presence' },
      { id: 'ARC-009', prompt: 'A glass-bottomed skywalk over a 1000-metre canyon, camera looks straight down through the glass', target: 'Vertiginous perspective, transparent material, extreme depth' },
      { id: 'ARC-010', prompt: 'The inside of a submarine control room, red lighting, dials and switches, the ship pitching', target: 'Confined technical space, motion, practical lighting' },
    ],
  },

  {
    category: 'wildlife',
    probes: [
      { id: 'WLD-001', prompt: 'A Bengal tiger walking slowly through tall grass, close tracking shot, muscles rippling, tail moving', target: 'Large animal biomechanics, fur simulation, predator movement' },
      { id: 'WLD-002', prompt: 'A murmuration of thousands of starlings forming and reforming patterns against an orange sunset sky', target: 'Mass behaviour simulation, flocking algorithm, scale' },
      { id: 'WLD-003', prompt: 'A salmon leaping up a waterfall against the current, water catching light, force visible', target: 'Animal + fluid dynamics combined, exertion, physics' },
      { id: 'WLD-004', prompt: 'A cheetah accelerating from zero to full sprint across a savannah, dust kicking up behind it', target: 'Fastest land animal gait, acceleration physics, grassland' },
      { id: 'WLD-005', prompt: 'A whale breaches in the open ocean, fully leaving the water, crashes back in a massive splash', target: 'Massive animal momentum, fluid dynamics at scale' },
      { id: 'WLD-006', prompt: 'A spider builds its web in time-lapse, each thread perfectly placed, dew on silk at dawn', target: 'Invertebrate motion, fine structure, time compression' },
      { id: 'WLD-007', prompt: 'A hummingbird hovers at a flower, wings invisible at speed, proboscis in bloom, iridescent feathers', target: 'High-speed wing blur, hovering physics, colour rendering' },
      { id: 'WLD-008', prompt: 'A pride of lions resting in afternoon shade, one yawns, cubs wrestle nearby', target: 'Animal group behaviour, idleness motion, cub play physics' },
      { id: 'WLD-009', prompt: 'An octopus changes colour and texture to match a coral reef, tentacles flowing', target: 'Colour change physics, fluid motion, camouflage accuracy' },
      { id: 'WLD-010', prompt: 'A wolf pack running in single file through deep snow, paw prints forming behind them', target: 'Coordinated animal locomotion, snow physics, tracking marks' },
    ],
  },

  {
    category: 'prompt_fidelity',
    probes: [
      { id: 'PRO-001', prompt: 'EXACTLY three red balloons tied to a white fence post in a green meadow on a sunny day, no other objects', target: 'Exact object count, colour, positioning, no hallucination' },
      { id: 'PRO-002', prompt: 'The camera starts looking straight down at the ground, then smoothly rotates 90 degrees to look at the horizon', target: 'Exact camera instruction following, spatial control' },
      { id: 'PRO-003', prompt: 'A SLOW motion shot where time appears to slow to 10% normal speed as a champagne glass is dropped', target: 'Speed control, temporal manipulation, dramatic effect' },
      { id: 'PRO-004', prompt: 'ONLY a single red apple on a white table against a pure white background. Nothing else in the frame.', target: 'Isolation, exact spec, no hallucination, clean background' },
      { id: 'PRO-005', prompt: 'First show a blue door. Then open it. Then show the room behind it which is completely empty.', target: 'Sequential instruction following, conditional reveal' },
      { id: 'PRO-006', prompt: 'Two people shaking hands. The left person is wearing red. The right person is wearing blue.', target: 'Colour assignment to specific entities, positional accuracy' },
      { id: 'PRO-007', prompt: 'Camera pans 360 degrees in exactly 8 seconds around a statue in a plaza, returning to start', target: 'Exact camera arc, timing, spatial return to origin' },
      { id: 'PRO-008', prompt: 'A scene that starts in bright sunshine and transitions to night in exactly 4 seconds', target: 'Temporal lighting transition, time accuracy' },
      { id: 'PRO-009', prompt: 'Show a table with FIVE distinct objects: a mug, a book, a plant, a pen, and glasses', target: 'Multi-object enumeration, exact count, no extras' },
      { id: 'PRO-010', prompt: 'The video must show ONLY the lower half of a person walking. Cut off at the waist. Nothing above.', target: 'Framing instruction, partial body, compositional control' },
    ],
  },

  {
    category: 'native_audio',
    probes: [
      { id: 'AUD-001', prompt: 'A crowded coffee shop, steam from espresso machine hissing, quiet jazz, murmur of conversation, cups clinking', target: 'Multi-source ambient audio accuracy and spatial placement' },
      { id: 'AUD-002', prompt: 'A woman says "I never thought I would see you again" with emotion, in a rain-soaked street at night', target: 'Dialogue clarity, lip sync accuracy, emotional tone in voice' },
      { id: 'AUD-003', prompt: 'A thunderstorm builds over the ocean, waves crash, thunder rolls, seagulls call and fly away', target: 'Natural sound design, audio-visual sync, crescendo' },
      { id: 'AUD-004', prompt: 'A blacksmith hammers hot metal on an anvil, metal rings, sparks scatter, fire crackles', target: 'Industrial sound design, synchronous impact audio' },
      { id: 'AUD-005', prompt: 'An orchestra tunes up before a concert, cacophony of instruments, then conductor raises baton, silence', target: 'Complex multi-instrument audio, crowd to silence transition' },
      { id: 'AUD-006', prompt: 'A child laughs while running through autumn leaves, leaves crunch with each step', target: 'Organic foley, synchronous footstep audio, natural ambience' },
      { id: 'AUD-007', prompt: 'A car engine starts cold, idles rough, then smooths out as it warms', target: 'Mechanical audio accuracy, temporal progression' },
      { id: 'AUD-008', prompt: 'A man whispers a secret to a woman in a library, books visible in background, near-silence', target: 'Low-volume speech, audio-visual sync, spatial audio' },
      { id: 'AUD-009', prompt: 'A glass is tapped with a spoon at a wedding, the room quiets, champagne glasses rise', target: 'Sound triggering response, crowd audio transition' },
      { id: 'AUD-010', prompt: 'A heartbeat monitor beeps steadily then flatlines, medical staff react', target: 'Medical sound design, emotional sync, accurate equipment audio' },
    ],
  },

  {
    category: 'efficiency',
    probes: [
      { id: 'EFF-001', prompt: 'A simple orange rolling across a white table, no shadows, top-down camera', target: 'Baseline simplest generation — measures floor quality' },
      { id: 'EFF-002', prompt: 'Dense city intersection at rush hour, 50+ vehicles, pedestrians, traffic lights, rain', target: 'Maximum complexity ceiling — measures peak capability' },
      { id: 'EFF-003', prompt: 'A single white candle burning against black background, no other elements', target: 'Near-zero complexity — pure model overhead baseline' },
      { id: 'EFF-004', prompt: 'A crowded Times Square at night, 100+ people, billboards, reflections, cars', target: 'High-detail urban scene at maximum occupancy' },
      { id: 'EFF-005', prompt: 'A plain grey sphere rotating slowly on a white surface', target: 'Simplest 3D object test — geometry + basic physics' },
      { id: 'EFF-006', prompt: 'A busy airport terminal, dozens of planes visible through windows, thousands of passengers', target: 'Maximum scale interior scene, crowd simulation ceiling' },
      { id: 'EFF-007', prompt: 'A single leaf falls from a tree in windless air, spins twice, lands on grass', target: 'Low complexity with one physics event — quality delta test' },
      { id: 'EFF-008', prompt: 'A massive battle scene with hundreds of soldiers, explosions, smoke, chaos', target: 'Maximum chaos scene — tests failure modes at saturation' },
    ],
  },
]

// Convenience lookup
export function getProbeSets(categories: string[]): ProbeSet[] {
  return PROBE_BATTERY.filter(s => categories.includes(s.category))
}

export function getProbeById(id: string): { probe: ProbeSet['probes'][0]; category: string } | null {
  for (const set of PROBE_BATTERY) {
    const probe = set.probes.find(p => p.id === id)
    if (probe) return { probe, category: set.category }
  }
  return null
}

export const ALL_CATEGORIES = PROBE_BATTERY.map(s => s.category)
