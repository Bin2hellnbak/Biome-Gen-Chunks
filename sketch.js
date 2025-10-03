/*
  Port of Processing (Java) sketch to p5.js (single-file)
  Notes:
  - Requires p5.js to be loaded before this script in an HTML page.
  - Global mode is used: setup(), draw(), and event handlers are defined globally.
*/

'use strict';

// ===== Constants =====
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT_MIN = 0;
const SEA_LEVEL = 150;
const CHUNK_HEIGHT_MAX = 300;

const DEFAULT_CAM_ZOOM = 0.3;
const DEFAULT_RENDER_DISTANCE = 20;

// ===== Globals =====
let camX = 0;
let camZ = 0;
let prevCamChunkX = 0, prevCamChunkZ = 0;
let prevCamChunkX2 = 0, prevCamChunkZ2 = 0;
let camZoom = DEFAULT_CAM_ZOOM;
let camMoveSpeed = 2.5;
let renderDistance = DEFAULT_RENDER_DISTANCE;
let generatedChunks = [];
let visibleChunks = [];

let worldGenScale = 0.01;
let worldGenType = 'Default'; // 'Default', 'Flat', 'Zenith'

let getVisibleChunksNextFrame = true;

let visibleSize = 5;

let displayMode = 'Biome';

let heldKeys = [];

let mouseOverChunk = null;
let mouseOverBlock = null;

// UI
let showChunkOutlinesCheckBox;
let buttons = [];
let zoomInButton, zoomOutButton;
let increaseRenderDistanceButton, decreaseRenderDistanceButton;
let recreateWorldButton;
let renderModeBiomeButton, renderModeHeightButton, renderModeBiomeHeightButton, renderModeTempButton, renderModeRainButton;

// ===== Helpers =====
function drawSquare(x, y, s) { rect(x, y, s, s); }

function containsInt(arr, v){ return arr.indexOf(v) !== -1; }

function removeInt(arr, v){
  const i = arr.indexOf(v);
  if(i !== -1){ arr.splice(i, 1); }
}

// ===== Classes =====
class Block {
  constructor(){
    this.x = 0; this.z = 0;
    this.y = 0;
    this.temp = 0;
    this.rainfall = 0;
    this.biome = null;
  }
}

class BiomeCls {
  constructor(name, r, g, b){
    this.name = name;
    this.r = r; this.g = g; this.b = b;
  }
  getColor(){ return color(this.r, this.g, this.b); }
}

// Keep the same names as the Processing enum for easy mapping
const Biome = {
  DESERT:      new BiomeCls('Desert',       255, 255, 100),
  SAVANNA:     new BiomeCls('Savanna',      187, 255, 120),
  PLAINS:      new BiomeCls('Plains',       100, 255, 100),
  SHRUBLAND:   new BiomeCls('Shrubland',    141, 255,  84),
  JUNGLE:      new BiomeCls('Jungle',         0, 200,   0),
  FOREST:      new BiomeCls('Forest',         0, 120,   0),
  BEACH:       new BiomeCls('Beach',        255, 255,   0),
  SNOWYPEAKS:  new BiomeCls('Snowy Peaks',  255, 255, 255),
  TUNDRA:      new BiomeCls('Tundra',       200, 200, 200),
  TAIGA:       new BiomeCls('Taiga',        120, 255, 196),
  OCEAN:       new BiomeCls('Ocean',          0,   0, 200),
  DEEPOCEAN:   new BiomeCls('Deep Ocean',     0,   0, 100),
  WARMOCEAN:   new BiomeCls('Warm Ocean',     0, 151, 189),
  COLDOCEAN:   new BiomeCls('Cold Ocean',    50, 100, 255),
  MOUNTAINS:   new BiomeCls('Mountains',    102, 102, 102),
  NULL:        new BiomeCls('Null',           0,   0,   0)
};

class Button {
  constructor(pos_, size_, label_, clickHandler_){
    this.pos = pos_.copy ? pos_.copy() : createVector(pos_.x, pos_.y);
    this.size = size_;
    this.label = label_;
    this.img = null;
    this.clickHandler = clickHandler_ || { onClick: () => {} };
    buttons.push(this);
  }
  isMouseOver(){
    return mouseX > this.pos.x && mouseX < this.pos.x + this.size && mouseY > this.pos.y && mouseY < this.pos.y + this.size;
  }
  onClick(){ /* unused (compat) */ }
  render(){
    // Box
    strokeWeight(1);
    stroke(255);
    fill(100);
    if(this.isMouseOver()) fill(200);
    drawSquare(this.pos.x, this.pos.y, this.size);

    // Image
    if(this.img){ image(this.img, this.pos.x, this.pos.y, this.size, this.size); }

    // Transparent background for label
    noStroke();
    fill(0, 10);
    rect(this.pos.x + this.size * 1.5, this.pos.y, textWidth(this.label), this.size);

    // Label
    fill(255);
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(this.size * 0.8);
    text(this.label, this.pos.x + this.size * 1.5, this.pos.y + this.size / 2);
  }
}

class CheckBox {
  constructor(pos_, size_, label_){
    this.pos = pos_.copy ? pos_.copy() : createVector(pos_.x, pos_.y);
    this.size = size_;
    this.label = label_;
    this.checked = false;
  }
  render(){
    // Box
    strokeWeight(1);
    stroke(255);
    noFill();
    drawSquare(this.pos.x, this.pos.y, this.size);

    // Check cross
    if(this.checked){
      line(this.pos.x, this.pos.y, this.pos.x + this.size, this.pos.y + this.size);
      line(this.pos.x + this.size, this.pos.y, this.pos.x, this.pos.y + this.size);
    }

    // Transparent background for label
    noStroke();
    fill(0, 100);
    rect(this.pos.x + this.size * 1.5, this.pos.y, textWidth(this.label), this.size);

    // Label
    fill(255);
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(this.size * 0.8);
    text(this.label, this.pos.x + this.size * 1.5, this.pos.y + this.size / 2);
  }
  isMouseOver(){
    return mouseX > this.pos.x && mouseX < this.pos.x + this.size && mouseY > this.pos.y && mouseY < this.pos.y + this.size;
  }
  toggle(){ this.checked = !this.checked; }
}

class Chunk {
  constructor(){
    this.x = 0; this.z = 0;
    this.blocks = new Array(CHUNK_SIZE);
    for(let i=0; i<CHUNK_SIZE; i++){ this.blocks[i] = new Array(CHUNK_SIZE); }
  }
}

// ===== Setup & Draw =====
function setup(){
  createCanvas(1000, 1000);
  frameRate(144);

  generatedChunks = [];
  visibleChunks = [];

  noiseDetail(4, 0.5);

  heldKeys = [];

  showChunkOutlinesCheckBox = new CheckBox(createVector(10, height - 40), 20, 'Show Chunk Outlines');
  zoomInButton = new Button(createVector(10, height - 70), 20, 'Zoom +', { onClick: () => changeCamZoom(1) });
  zoomOutButton = new Button(createVector(10, height - 100), 20, 'Zoom -', { onClick: () => changeCamZoom(-1) });
  increaseRenderDistanceButton = new Button(createVector(10, height - 130), 20, 'Render Distance +', { onClick: () => changeRenderDistance(1) });
  decreaseRenderDistanceButton = new Button(createVector(10, height - 160), 20, 'Render Distance -', { onClick: () => changeRenderDistance(-1) });
  recreateWorldButton = new Button(createVector(10, height - 190), 20, 'Recreate World', { onClick: () => recreateWorld() });
  renderModeBiomeButton = new Button(createVector(10, height - 220), 20, 'Show Biome', { onClick: () => { displayMode = 'Biome'; } });
  renderModeHeightButton = new Button(createVector(10, height - 250), 20, 'Show Height', { onClick: () => { displayMode = 'Height'; } });
  renderModeBiomeHeightButton = new Button(createVector(10, height - 280), 20, 'Show Biome + Height', { onClick: () => { displayMode = 'Biome + Height'; } });
  renderModeTempButton = new Button(createVector(10, height - 310), 20, 'Show Temperature', { onClick: () => { displayMode = 'Temperature'; } });
  renderModeRainButton = new Button(createVector(10, height - 340), 20, 'Show Rainfall', { onClick: () => { displayMode = 'Rainfall'; } });
}

function draw(){
  processKeys();

  if(getVisibleChunksNextFrame){
    getVisibleChunks();
    getVisibleChunksNextFrame = false;
  }

  background(0);
  renderVisibleChunks();
  renderUI();
}

// ===== World / Chunks =====
function generateChunk(chunkX, chunkZ){
  const newChunk = new Chunk();
  newChunk.x = chunkX;
  newChunk.z = chunkZ;

  const chunkWorldX = chunkX * CHUNK_SIZE;
  const chunkWorldZ = chunkZ * CHUNK_SIZE;

  // Create blocks
  for(let zi=0; zi<CHUNK_SIZE; zi++){
    for(let xi=0; xi<CHUNK_SIZE; xi++){
      const newBlock = new Block();
      newBlock.x = chunkWorldX + xi;
      newBlock.z = chunkWorldZ + zi;
      newChunk.blocks[xi][zi] = newBlock;
    }
  }

  if(worldGenType === 'Default'){
    // Islands (height)
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const localScale = worldGenScale;
        const offsetX = 56852;
        const offsetZ = 27384;
        const n = noise((chunkWorldX + xi + offsetX) * localScale, (chunkWorldZ + zi + offsetZ) * localScale);
        const y = map(n, 0, 1, CHUNK_HEIGHT_MIN, CHUNK_HEIGHT_MAX);
        block.y = y;
      }
    }

    // Temperature
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const localScale = worldGenScale / 4;
        const offsetX = 97445;
        const offsetZ = 43758;
        const n = noise((chunkWorldX + xi + offsetX) * localScale, (chunkWorldZ + zi + offsetZ) * localScale);
        block.temp = n;
      }
    }

    // Rainfall
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const localScale = worldGenScale / 4;
        const offsetX = 85637;
        const offsetZ = 23548;
        const n = noise((chunkWorldX + xi + offsetX) * localScale, (chunkWorldZ + zi + offsetZ) * localScale);
        block.rainfall = n;
      }
    }

    // Biomes
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const y = block.y;
        const temp = block.temp;
        const rainfall = block.rainfall;

        let biome = null;

        if(y < SEA_LEVEL){
          // Oceans
          if(y < (SEA_LEVEL / 2.0)){
            biome = Biome.DEEPOCEAN;
          } else {
            if(temp < 0.33){      biome = Biome.COLDOCEAN; }
            else if(temp < 0.66){ biome = Biome.OCEAN; }
            else {                 biome = Biome.WARMOCEAN; }
          }
        }
        else if(y < CHUNK_HEIGHT_MAX / 1.4){
          // Land
          if(temp < 0.25){
            if(rainfall < 0.25){ biome = Biome.TUNDRA; }
            else {               biome = Biome.TAIGA; }
          }
          else if(temp < 0.5){
            if(rainfall < 0.25){ biome = Biome.PLAINS; }
            else {               biome = Biome.SHRUBLAND; }
          }
          else{
            if(rainfall < 0.25){      biome = Biome.DESERT; }
            else if(rainfall < 0.5){  biome = Biome.SAVANNA; }
            else if(rainfall < 0.75){ biome = Biome.FOREST; }
            else {                    biome = Biome.JUNGLE; }
          }
          if(biome == null){ block.biome = Biome.NULL; }
        }
        else{
          // Mountains
          biome = Biome.MOUNTAINS;
          if(temp > 0.5){
            if(y > CHUNK_HEIGHT_MAX / 1.2){ biome = Biome.SNOWYPEAKS; }
          } else {
            if(y > CHUNK_HEIGHT_MAX / 1.35){ biome = Biome.SNOWYPEAKS; }
          }
        }

        block.biome = biome;
      }
    }
  }
  else if(worldGenType === 'Flat'){
    // Flat Plains
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        block.y = SEA_LEVEL;
        block.temp = 0.5;
        block.rainfall = 0.5;
        block.biome = Biome.PLAINS;
      }
    }
  }
  else if(worldGenType === 'Zenith'){
    const islandRadius = 500;
    const islandCenter = createVector(0, 0);
    const oceanFloorMax = SEA_LEVEL / 2;

    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const localScale = worldGenScale;
        const offsetX = 56852;
        const offsetZ = 27384;
        const n = noise((chunkWorldX + xi + offsetX) * localScale, (chunkWorldZ + zi + offsetZ) * localScale);
        const oceanElev = map(n, 0, 1, CHUNK_HEIGHT_MIN, oceanFloorMax);

        const directionToCenter = atan2((chunkWorldZ + zi) - islandCenter.y, (chunkWorldX + xi) - islandCenter.x);
        const islandEdgeVariationNoise = noise(cos(directionToCenter) + 1000, sin(directionToCenter) + 1000);
        const islandEdgeVariation = map(islandEdgeVariationNoise, 0, 1, -1, 1) * islandRadius / 4.0;
        const variedIslandRadius = islandRadius + islandEdgeVariation;
        const distFromIslandCenter = dist(chunkWorldX + xi, chunkWorldZ + zi, islandCenter.x, islandCenter.y);
        const distFromIslandEdge = distFromIslandCenter - variedIslandRadius;
        const oceanToIslandBlendDist = (variedIslandRadius / 4.0);
        const distFromIslandEdgeClamped = constrain(distFromIslandEdge, 0, oceanToIslandBlendDist);

        const distFromOceanIslandBlend = distFromIslandEdge - oceanToIslandBlendDist;
        const oceanMaxDistanceFromIsland = variedIslandRadius * 3;

        let y = CHUNK_HEIGHT_MIN;

        if(distFromIslandEdgeClamped < oceanToIslandBlendDist){
          // Blend from ocean to island
          const blendFactor = map(distFromIslandEdgeClamped, 0, oceanToIslandBlendDist, 1, 0);
          const diffToSeaLevel = SEA_LEVEL - oceanElev;
          y = oceanElev + (diffToSeaLevel * blendFactor);
        }
        else if(distFromOceanIslandBlend < oceanMaxDistanceFromIsland){
          // Blend from deep ocean to ocean
          // const blendFactor = map(distFromOceanIslandBlend, 0, oceanMaxDistanceFromIsland, 0, 1);
          // const diffToSeaLevel = SEA_LEVEL - oceanElev;
          y = oceanElev;
        }
        block.y = y;
      }
    }

    // Temperature
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const localScale = worldGenScale / 4;
        const offsetX = 97445;
        const offsetZ = 43758;
        const n = noise((chunkWorldX + xi + offsetX) * localScale, (chunkWorldZ + zi + offsetZ) * localScale);
        block.temp = n;
      }
    }

    // Rainfall
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const localScale = worldGenScale / 4;
        const offsetX = 85637;
        const offsetZ = 23548;
        const n = noise((chunkWorldX + xi + offsetX) * localScale, (chunkWorldZ + zi + offsetZ) * localScale);
        block.rainfall = n;
      }
    }

    // Biomes
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = newChunk.blocks[xi][zi];
        const y = block.y;
        const temp = block.temp;
        const rainfall = block.rainfall;

        let biome = null;

        if(y < SEA_LEVEL){
          if(y < (SEA_LEVEL / 2.0)){
            biome = Biome.DEEPOCEAN;
          } else {
            if(temp < 0.33){      biome = Biome.COLDOCEAN; }
            else if(temp < 0.66){ biome = Biome.OCEAN; }
            else {                 biome = Biome.WARMOCEAN; }
          }
        }
        else if(y < CHUNK_HEIGHT_MAX / 1.4){
          if(temp < 0.25){
            if(rainfall < 0.25){ biome = Biome.TUNDRA; }
            else {               biome = Biome.TAIGA; }
          }
          else if(temp < 0.5){
            if(rainfall < 0.25){ biome = Biome.PLAINS; }
            else {               biome = Biome.SHRUBLAND; }
          }
          else{
            if(rainfall < 0.25){      biome = Biome.DESERT; }
            else if(rainfall < 0.5){  biome = Biome.SAVANNA; }
            else if(rainfall < 0.75){ biome = Biome.FOREST; }
            else {                    biome = Biome.JUNGLE; }
          }
          if(biome == null){ block.biome = Biome.NULL; }
        }
        else{
          biome = Biome.MOUNTAINS;
          if(temp > 0.5){
            if(y > CHUNK_HEIGHT_MAX / 1.2){ biome = Biome.SNOWYPEAKS; }
          } else {
            if(y > CHUNK_HEIGHT_MAX / 1.35){ biome = Biome.SNOWYPEAKS; }
          }
        }

        block.biome = biome;
      }
    }
  }

  generatedChunks.push(newChunk);
  return newChunk;
}

function getGeneratedChunk(chunkX, chunkZ){
  for(const generatedChunk of generatedChunks){
    if(generatedChunk.x === chunkX && generatedChunk.z === chunkZ){ return generatedChunk; }
  }
  return null;
}

function chunkIsAlreadyGenerated(chunkX, chunkZ){
  return getGeneratedChunk(chunkX, chunkZ) !== null;
}

function getVisibleChunk(chunkX, chunkZ){
  for(const visibleChunk of visibleChunks){
    if(visibleChunk.x === chunkX && visibleChunk.z === chunkZ){ return visibleChunk; }
  }
  return null;
}

function chunkIsAlreadyVisible(chunkX, chunkZ){
  return getVisibleChunk(chunkX, chunkZ) !== null;
}

function recreateWorld(){
  noStroke();
  fill(0, 200);
  rect(0, 0, width, height);
  textAlign(CENTER, CENTER);
  textSize(50);
  fill(255);
  text('Recreating World...', width / 2, height / 2);

  camX = 0;
  camZ = 0;
  camZoom = DEFAULT_CAM_ZOOM;
  renderDistance = DEFAULT_RENDER_DISTANCE;

  generatedChunks.length = 0;
  visibleChunks.length = 0;
  noiseSeed(int(random(100000)));
  getVisibleChunksNextFrame = true;
}

function getVisibleChunks(){
  // Get chunk coordinates of camera
  const camChunkX = floor(camX / CHUNK_SIZE);
  const camChunkZ = floor(camZ / CHUNK_SIZE);

  // Initial full fill to avoid gaps when starting or after clears
  if(visibleChunks.length === 0){
    for(let dz = -renderDistance; dz <= renderDistance; dz++){
      for(let dx = -renderDistance; dx <= renderDistance; dx++){
        const chunkX = camChunkX + dx;
        const chunkZ = camChunkZ + dz;
        if(chunkIsAlreadyGenerated(chunkX, chunkZ)){
          visibleChunks.push(getGeneratedChunk(chunkX, chunkZ));
        } else {
          visibleChunks.push(generateChunk(chunkX, chunkZ));
        }
      }
    }
    prevCamChunkX2 = camChunkX;
    prevCamChunkZ2 = camChunkZ;
    return;
  }

  let dx = camChunkX - prevCamChunkX2;
  let dz = camChunkZ - prevCamChunkZ2;

  // Stepwise update from previous to current chunk to avoid holes when skipping multiple chunks per frame
  while(dx !== 0 || dz !== 0){
    if(dx !== 0){
      const stepX = dx > 0 ? 1 : -1;

      // Remove one column on the opposite edge and add one column on the moving edge, using the previous Z baseline
      for(let zOff = -renderDistance; zOff <= renderDistance; zOff++){
        const removeChunkX = prevCamChunkX2 - (renderDistance * stepX);
        const removeChunkZ = prevCamChunkZ2 + zOff;
        const toRemove = getVisibleChunk(removeChunkX, removeChunkZ);
        if(toRemove){
          const idx = visibleChunks.indexOf(toRemove);
          if(idx !== -1) visibleChunks.splice(idx, 1);
        }

        const addChunkX = prevCamChunkX2 + (renderDistance * stepX) + stepX;
        const addChunkZ = prevCamChunkZ2 + zOff;
        if(chunkIsAlreadyGenerated(addChunkX, addChunkZ)){
          visibleChunks.push(getGeneratedChunk(addChunkX, addChunkZ));
        } else {
          visibleChunks.push(generateChunk(addChunkX, addChunkZ));
        }
      }

      prevCamChunkX2 += stepX;
      dx -= stepX;
    } else if(dz !== 0){
      const stepZ = dz > 0 ? 1 : -1;

      // Remove one row on the opposite edge and add one row on the moving edge, using the previous X baseline
      for(let xOff = -renderDistance; xOff <= renderDistance; xOff++){
        const removeChunkX = prevCamChunkX2 + xOff;
        const removeChunkZ = prevCamChunkZ2 - (renderDistance * stepZ);
        const toRemove = getVisibleChunk(removeChunkX, removeChunkZ);
        if(toRemove){
          const idx = visibleChunks.indexOf(toRemove);
          if(idx !== -1) visibleChunks.splice(idx, 1);
        }

        const addChunkX = prevCamChunkX2 + xOff;
        const addChunkZ = prevCamChunkZ2 + (renderDistance * stepZ) + stepZ;
        if(chunkIsAlreadyGenerated(addChunkX, addChunkZ)){
          visibleChunks.push(getGeneratedChunk(addChunkX, addChunkZ));
        } else {
          visibleChunks.push(generateChunk(addChunkX, addChunkZ));
        }
      }

      prevCamChunkZ2 += stepZ;
      dz -= stepZ;
    }
  }
}

function getVisibleChunksO(){
  const camChunkX = floor(camX / CHUNK_SIZE);
  const camChunkZ = floor(camZ / CHUNK_SIZE);

  visibleChunks.length = 0;

  for(let dz = -renderDistance; dz <= renderDistance; dz++){
    for(let dx = -renderDistance; dx <= renderDistance; dx++){
      const chunkX = camChunkX + dx;
      const chunkZ = camChunkZ + dz;
      if(chunkIsAlreadyGenerated(chunkX, chunkZ)){
        visibleChunks.push(getGeneratedChunk(chunkX, chunkZ));
      } else {
        visibleChunks.push(generateChunk(chunkX, chunkZ));
      }
    }
  }
}

function renderVisibleChunks(){
  // Render blocks
  strokeCap(PROJECT);
  strokeWeight(1);

  for(const visibleChunk of visibleChunks){
    const chunkX = visibleChunk.x;
    const chunkZ = visibleChunk.z;
    const chunkWorldX = chunkX * CHUNK_SIZE;
    const chunkWorldZ = chunkZ * CHUNK_SIZE;

    const squareSize = visibleSize * camZoom * 1.1;

    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = visibleChunk.blocks[xi][zi];

        const biomeCol = block.biome ? block.biome.getColor() : color(0);

        let r = 0, g = 0, b = 0;
        if(displayMode === 'Biome'){
          if(block.biome){
            r = red(biomeCol);
            g = green(biomeCol);
            b = blue(biomeCol);
          }
        }
        else if(displayMode === 'Temperature'){
          r = map(block.temp, 0, 1, 0, 255);
          g = map(block.temp, 0, 1, 0, 100);
          b = map(block.temp, 0, 1, 255, 0);
        }
        else if(displayMode === 'Rainfall'){
          r = 255 * (1 - block.rainfall);
          g = 255 * (1 - block.rainfall);
          b = (255 * (1 - block.rainfall)) + (255 * block.rainfall);
        }
        else if(displayMode === 'Height'){
          r = map(block.y, CHUNK_HEIGHT_MIN, CHUNK_HEIGHT_MAX, 0, 255);
          g = map(block.y, CHUNK_HEIGHT_MIN, CHUNK_HEIGHT_MAX, 0, 255);
          b = map(block.y, CHUNK_HEIGHT_MIN, CHUNK_HEIGHT_MAX, 0, 255);
        }
        else if(displayMode === 'Biome + Height'){
          r = map(block.y, CHUNK_HEIGHT_MIN, CHUNK_HEIGHT_MAX, 0, red(biomeCol));
          g = map(block.y, CHUNK_HEIGHT_MIN, CHUNK_HEIGHT_MAX, 0, green(biomeCol));
          b = map(block.y, CHUNK_HEIGHT_MIN, CHUNK_HEIGHT_MAX, 0, blue(biomeCol));
        }
        const colVal = color(r, g, b);

        const squareX = ((chunkWorldX + xi - camX) * visibleSize) * camZoom;
        const squareZ = ((chunkWorldZ + zi - camZ) * visibleSize) * camZoom;

        if(squareSize > 1){
          if(block === mouseOverBlock){
            fill(color(r * 1.5, g * 1.5, b * 1.5));
          } else {
            fill(colVal);
          }
          drawSquare(width/2 + squareX, width/2 + squareZ, squareSize);
        }
        else{
          stroke(colVal);
          point(width/2 + squareX, width/2 + squareZ);
        }
      }
    }
  }

  // Render Chunk Outlines
  if(showChunkOutlinesCheckBox.checked){
    if(camZoom > 0.2){
      noFill();
      for(const visibleChunk of visibleChunks){
        const chunkX = visibleChunk.x;
        const chunkZ = visibleChunk.z;
        const chunkWorldX = chunkX * CHUNK_SIZE;
        const chunkWorldZ = chunkZ * CHUNK_SIZE;

        const squareX = ((chunkWorldX - camX) * visibleSize) * camZoom;
        const squareZ = ((chunkWorldZ - camZ) * visibleSize) * camZoom;
        const sSize = (CHUNK_SIZE * visibleSize) * camZoom;

        if(mouseOverChunk){
          if(visibleChunk === mouseOverChunk){
            strokeWeight(2);
            stroke(0, 255, 0);
          } else {
            strokeWeight(1);
            stroke(255, 25);
          }
        } else {
          strokeWeight(1);
          stroke(255, 25);
        }

        drawSquare(width/2 + squareX, width/2 + squareZ, sSize);
      }
    }
  }
}

function renderUI(){
  renderText();
  showChunkOutlinesCheckBox.render();
  for(const b of buttons){ b.render(); }

  // Legend for non-biome modes
  if(displayMode === 'Height' || displayMode === 'Biome + Height' || displayMode === 'Temperature' || displayMode === 'Rainfall'){
    const boxSize = 30;
    const padding = 5;
    const spacing = 40;
    const totalWidth = (boxSize * 2) + spacing;
    const startX = width / 2.0 - (totalWidth / 2.0);
    const startY = height - boxSize - padding;

    const secondBoxX = startX + boxSize + spacing;

    // Min
    fill(0);
    rect(startX, startY, boxSize, boxSize);
    let minCol = color(0);
    if(displayMode === 'Height' || displayMode === 'Biome + Height'){
      minCol = color(0, 0, 0);
    }
    else if(displayMode === 'Temperature'){
      minCol = color(0, 0, 255);
    }
    else if(displayMode === 'Rainfall'){
      minCol = color(255, 255, 255);
    }
    fill(minCol);
    rect(startX + 2, startY + 2, boxSize - 4, boxSize - 4);

    // Max
    fill(0);
    rect(secondBoxX, startY, boxSize, boxSize);
    let maxCol = color(255);
    if(displayMode === 'Height' || displayMode === 'Biome + Height'){
      maxCol = color(255, 255, 255);
    }
    else if(displayMode === 'Temperature'){
      maxCol = color(255, 0, 0);
    }
    else if(displayMode === 'Rainfall'){
      maxCol = color(0, 0, 255);
    }
    fill(maxCol);
    rect(secondBoxX + 2, startY + 2, boxSize - 4, boxSize - 4);

    // Labels
    textSize(12);
    textAlign(LEFT, CENTER);
    noStroke();
    fill(255);
    const labelY = startY + boxSize / 2.0;
    const labelGap = 6;
    const minLabelX = startX + boxSize + labelGap;
    const maxLabelX = secondBoxX + boxSize + labelGap;

    let minLabel = 'Min';
    let maxLabel = 'Max';
    if(displayMode === 'Rainfall'){
      minLabel = 'dry';
      maxLabel = 'wet';
    }
    else if(displayMode === 'Temperature'){
      minLabel = 'cold';
      maxLabel = 'hot';
    }
    else if(displayMode === 'Height' || displayMode === 'Biome + Height'){
      minLabel = 'low';
      maxLabel = 'high';
    }

    text(minLabel, minLabelX, labelY);
    text(maxLabel, maxLabelX, labelY);
  }
}

function renderText(){
  const infoLines = [];
  infoLines.push('FPS: ' + nf(frameRate(), 0, 2));
  infoLines.push('');
  infoLines.push('Generated Chunks: ' + generatedChunks.length);
  infoLines.push('Visible Chunks: ' + visibleChunks.length);
  infoLines.push('Cam Pos: ' + camX + ', ' + camZ);
  infoLines.push('Cam Zoom: ' + camZoom);
  infoLines.push('Render Dist: ' + renderDistance);
  infoLines.push('Display Mode: ' + displayMode);
  if(mouseOverChunk){
    infoLines.push('');
    infoLines.push('Chunk: ' + mouseOverChunk.x + ', ' + mouseOverChunk.z);
  }
  if(mouseOverBlock){
    infoLines.push('');
    infoLines.push('Block: ' + mouseOverBlock.x + ', ' + mouseOverBlock.y + ', ' + mouseOverBlock.z);
    if(mouseOverBlock.biome){ infoLines.push('Biome: ' + mouseOverBlock.biome.name); }
    infoLines.push('Temp: ' + mouseOverBlock.temp);
    infoLines.push('Rain: ' + mouseOverBlock.rainfall);
  }
  const textSizeVal = 20;
  textSize(textSizeVal);
  textAlign(LEFT, TOP);

  noStroke();
  for(let i=0; i<infoLines.length; i++){
    const infoLine = infoLines[i];
    fill(0, 100);
    rect(0, i * textSizeVal, textWidth(infoLine), textSizeVal);
    fill(255);
    text(infoLine, 0, i * textSizeVal);
  }
}

function setDisplayMode(mode){
  if(mode === displayMode) return;
  displayMode = mode;
}

function moveCam(dirX, dirZ){
  // Check chunk change and update visible chunks if needed
  const camChunkPos = getCamChunkPos();
  const camChunkX = int(camChunkPos.x);
  const camChunkZ = int(camChunkPos.y);
  if(camChunkX !== prevCamChunkX || camChunkZ !== prevCamChunkZ){
    prevCamChunkX = camChunkX;
    prevCamChunkZ = camChunkZ;
    getVisibleChunksNextFrame = true;
  }

  // Move cam based on direction and speed
  let moveSpeed = camMoveSpeed;
  if(containsInt(heldKeys, 16)){ // SHIFT
    moveSpeed = camMoveSpeed * 2;
  }
  else if(containsInt(heldKeys, 17)){ // CTRL
    moveSpeed = camMoveSpeed / 2;
  }
  moveSpeed /= (camZoom * 1);
  camX += dirX * moveSpeed;
  camZ += dirZ * moveSpeed;

  updateMouseOverInfo();
}

function changeRenderDistance(change){
  renderDistance += change;
  renderDistance = constrain(renderDistance, 1, 100);
  getVisibleChunksNextFrame = true;
  visibleChunks.length = 0;
}

function changeCamZoom(direction){
  const zoomSpeed = camZoom / 10;
  camZoom += (zoomSpeed * direction);
  camZoom = constrain(camZoom, 0.1, 10);
}

function getCamChunkPos(){
  const camChunkX = floor(camX / CHUNK_SIZE);
  const camChunkZ = floor(camZ / CHUNK_SIZE);
  return createVector(camChunkX, camChunkZ);
}

function getChunkFromWorldPos(worldX, worldZ){
  const chunkX = floor(worldX / CHUNK_SIZE);
  const chunkZ = floor(worldZ / CHUNK_SIZE);
  return getGeneratedChunk(chunkX, chunkZ);
}

function processKeys(){
  for(const heldKey of heldKeys){
    if(heldKey === 38 || heldKey === 87){ // Up or W
      moveCam(0, -1);
    }
    if(heldKey === 40 || heldKey === 83){ // Down or S
      moveCam(0, 1);
    }
    if(heldKey === 37 || heldKey === 65){ // Left or A
      moveCam(-1, 0);
    }
    if(heldKey === 39 || heldKey === 68){ // Right or D
      moveCam(1, 0);
    }

    if(heldKey === 107){ changeRenderDistance(1); }
    if(heldKey === 109){ changeRenderDistance(-1); }

    if(heldKey === 105){ changeCamZoom(1); }
    if(heldKey === 99){  changeCamZoom(-1); }
  }

  if(mouseIsPressed && mouseButton === LEFT){
    // paintBiome(mouseX, mouseY);
    // Buttons can be clicked via mouseClicked()
  }
}

function keyPressed(){
  if(!containsInt(heldKeys, keyCode)){
    heldKeys.push(keyCode);
  }
}

function keyReleased(){
  // console log for debugging key codes
  console.log(keyCode);

  if(keyCode === 49){ setDisplayMode('Biome'); }
  if(keyCode === 50){ setDisplayMode('Height'); }
  if(keyCode === 51){ setDisplayMode('Biome + Height'); }
  if(keyCode === 52){ setDisplayMode('Temperature'); }
  if(keyCode === 53){ setDisplayMode('Rainfall'); }

  removeInt(heldKeys, keyCode);
}

function mouseMoved(){
  updateMouseOverInfo();

  let mouseIsOverButton = false;
  for(const b of buttons){
    if(b.isMouseOver() || showChunkOutlinesCheckBox.isMouseOver()){
      mouseIsOverButton = true;
      break;
    }
  }
  if(mouseIsOverButton){
    cursor(HAND);
  } else {
    cursor(ARROW);
  }
}

function updateMouseOverInfo(){
  const chunk = getChunkFromScreenPos(mouseX, mouseY);
  mouseOverChunk = chunk || null;

  const block = getBlockFromScreenPos(mouseX, mouseY);
  if(block == null){
    mouseOverBlock = null;
    return;
  }
  mouseOverBlock = block;
}

function getChunkFromScreenPos(screenX, screenY){
  const worldX = ((screenX - width/2) / camZoom) / visibleSize + camX;
  const worldZ = ((screenY - height/2) / camZoom) / visibleSize + camZ;

  const chunkX = floor(worldX / CHUNK_SIZE);
  const chunkZ = floor(worldZ / CHUNK_SIZE);

  if(!chunkIsAlreadyGenerated(chunkX, chunkZ)){
    return null;
  }
  return getGeneratedChunk(chunkX, chunkZ);
}

function getBlockFromScreenPos(screenX, screenY){
  const worldX = ((screenX - width/2) / camZoom) / visibleSize + camX;
  const worldZ = ((screenY - height/2) / camZoom) / visibleSize + camZ;

  const chunkX = floor(worldX / CHUNK_SIZE);
  const chunkZ = floor(worldZ / CHUNK_SIZE);

  if(!chunkIsAlreadyGenerated(chunkX, chunkZ)){
    return null;
  }

  const localX = floor(worldX) - (chunkX * CHUNK_SIZE);
  const localZ = floor(worldZ) - (chunkZ * CHUNK_SIZE);

  const chunk = getGeneratedChunk(chunkX, chunkZ);
  if(chunk == null){ return null; }
  return chunk.blocks[localX][localZ];
}

function getColorFromBiome(biome){
  if(!biome){ return color(0); }
  return biome.getColor();
}

function paintBiome(screenX, screenY){
  const mouseBlock = getBlockFromScreenPos(screenX, screenY);
  if(mouseBlock == null) return;
  const blocksInRadius = getBlocksInRadius(mouseBlock, 10 / camZoom);
  for(const block of blocksInRadius){
    block.biome = Biome.DEEPOCEAN;
  }
}

function getBlocksInRadius(centerBlock, radius){
  const blocksInRadius = [];
  if(centerBlock == null) return blocksInRadius;

  const centerX = centerBlock.x;
  const centerZ = centerBlock.z;

  for(const visibleChunk of visibleChunks){
    for(let zi=0; zi<CHUNK_SIZE; zi++){
      for(let xi=0; xi<CHUNK_SIZE; xi++){
        const block = visibleChunk.blocks[xi][zi];
        const blockX = block.x;
        const blockZ = block.z;
        const d = dist(centerX, centerZ, blockX, blockZ);
        if(d <= radius){ blocksInRadius.push(block); }
      }
    }
  }
  return blocksInRadius;
}

function mouseClicked(){
  let clickedButton = null;
  for(const b of buttons){
    if(b.isMouseOver()){ clickedButton = b; break; }
  }
  if(clickedButton){ clickedButton.clickHandler.onClick(); }

  if(showChunkOutlinesCheckBox.isMouseOver()){
    showChunkOutlinesCheckBox.checked = !showChunkOutlinesCheckBox.checked;
  }
}

function mouseWheel(event){
  const e = event.delta; // positive on down, negative on up
  const zoomSpeed = (camZoom / 50) * 5;
  camZoom -= e * zoomSpeed * 0.01; // scale down for browser delta
  camZoom = constrain(camZoom, 0.1, 10);
}
