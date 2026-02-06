import { Coordinates, VRU, VRUType, RiskLevel, SensorSource, SimulationState, Zone } from '../types';
import { INITIAL_CENTER, INITIAL_VRUS_CONFIG } from '../constants';
import { quantumService } from './QuantumService';

// This service mimics the FastAPI/Django Backend + PostGIS logic.
// It handles entity movement, collision detection, and state management.

const EARTH_RADIUS = 6371000; // meters

function moveCoordinate(coord: Coordinates, dx: number, dy: number): Coordinates {
  const dLat = (dy / EARTH_RADIUS) * (180 / Math.PI);
  const dLng = (dx / (EARTH_RADIUS * Math.cos((Math.PI * coord.lat) / 180))) * (180 / Math.PI);
  return {
    lat: coord.lat + dLat,
    lng: coord.lng + dLng
  };
}

function getDistance(a: Coordinates, b: Coordinates): number {
  const R = 6371e3; // metres
  const φ1 = a.lat * Math.PI/180;
  const φ2 = b.lat * Math.PI/180;
  const Δφ = (b.lat-a.lat) * Math.PI/180;
  const Δλ = (b.lng-a.lng) * Math.PI/180;

  const x = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));

  return R * c;
}

class SimulationService {
  private state: SimulationState;
  private intervalId: number | null = null;
  private subscribers: ((state: SimulationState) => void)[] = [];

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): SimulationState {
    const vrus: VRU[] = [];
    let idCounter = 0;

    // Generate Initial VRUs
    INITIAL_VRUS_CONFIG.forEach(config => {
      for (let i = 0; i < config.count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = config.type === VRUType.VEHICLE ? 12 : (config.type === VRUType.CYCLIST ? 6 : 1.5);
        
        vrus.push({
          id: `vru-${idCounter++}`,
          type: config.type,
          position: moveCoordinate(INITIAL_CENTER, (Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400),
          velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
          heading: (angle * 180) / Math.PI,
          sensors: this.generateRandomSensors(),
          riskLevel: RiskLevel.SAFE,
          localizationError: 5.0,
          isUserControlled: false
        });
      }
    });

    // Add User VRU with 10 distinct sensors
    vrus.push({
      id: 'user-agent',
      type: VRUType.PEDESTRIAN,
      position: INITIAL_CENTER,
      velocity: { x: 0, y: 0 },
      heading: 0,
      sensors: this.generateUserSensors(),
      riskLevel: RiskLevel.SAFE,
      localizationError: 1.0,
      isUserControlled: true
    });

    return {
      vrus,
      zones: this.generateZones(vrus),
      timestamp: Date.now(),
      metrics: {
        totalVRUs: vrus.length,
        avgError: 0,
        quantumFusionActive: false,
        collisionWarnings: 0
      }
    };
  }

  private generateRandomSensors(): SensorSource[] {
    const sensors: SensorSource[] = [{ id: 'gps-1', name: 'GPS L1', type: 'GPS', accuracy: 5.0, active: true }];
    if (Math.random() > 0.5) sensors.push({ id: 'cam-1', name: 'Camera', type: 'CAMERA', accuracy: 2.0, active: true });
    return sensors;
  }

  private generateUserSensors(): SensorSource[] {
    return [
      { id: 's1', name: 'GPS L1 (Standard)', type: 'GPS', accuracy: 5.0, active: true },
      { id: 's2', name: 'GPS L5 (Precision)', type: 'GPS', accuracy: 2.5, active: true },
      { id: 's3', name: 'Galileo E1/E5', type: 'GPS', accuracy: 2.0, active: true },
      { id: 's4', name: 'GLONASS', type: 'GPS', accuracy: 4.0, active: false },
      { id: 's5', name: 'Velodyne LiDAR', type: 'LIDAR', accuracy: 0.1, active: false },
      { id: 's6', name: 'Stereo Camera (Front)', type: 'CAMERA', accuracy: 1.5, active: false },
      { id: 's7', name: 'Wide Cam (Rear)', type: 'CAMERA', accuracy: 2.0, active: false },
      { id: 's8', name: 'Radar (Long Range)', type: 'RADAR', accuracy: 0.8, active: false },
      { id: 's9', name: 'UWB Anchor', type: 'UWB', accuracy: 0.2, active: false },
      { id: 's10', name: '5G V2X Sidelink', type: 'V2X', accuracy: 0.5, active: false },
    ];
  }

  private generateZones(vrus: VRU[]): Zone[] {
    const zones: Zone[] = [];
    const gridSize = 150; 

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        const center = moveCoordinate(INITIAL_CENTER, x * gridSize, y * gridSize);
        const count = vrus.filter(v => getDistance(v.position, center) < gridSize / 2).length;
        
        let risk = RiskLevel.SAFE;
        if (count > 2) risk = RiskLevel.WARNING;
        if (count > 4) risk = RiskLevel.CRITICAL;

        zones.push({
          id: `zone-${x}-${y}`,
          bounds: [
            moveCoordinate(center, -50, -50),
            moveCoordinate(center, 50, -50),
            moveCoordinate(center, 50, 50),
            moveCoordinate(center, -50, 50),
          ],
          density: count,
          riskLevel: risk
        });
      }
    }
    return zones;
  }

  public start() {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(() => {
      this.tick();
    }, 100);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public subscribe(callback: (state: SimulationState) => void) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(s => s !== callback);
    };
  }

  private tick() {
    const { vrus } = this.state;
    let collisionWarnings = 0;
    let totalError = 0;
    let quantumActiveCount = 0;

    const nextVRUs = vrus.map(vru => {
      let nextPos = vru.position;
      if (!vru.isUserControlled || (vru.velocity.x !== 0 || vru.velocity.y !== 0)) {
         nextPos = moveCoordinate(vru.position, vru.velocity.x * 0.1, vru.velocity.y * 0.1);
         if (getDistance(nextPos, INITIAL_CENTER) > 500) {
           nextPos = INITIAL_CENTER; 
         }
      }

      // Filter only ACTIVE sensors for fusion
      const activeSensors = vru.sensors.filter(s => s.active);
      
      // Cooperative: If nearby, add a virtual V2X sensor
      const nearby = vrus.filter(other => other.id !== vru.id && getDistance(vru.position, other.position) < 20);
      const fusionSensors = [...activeSensors];
      
      if (nearby.length > 0) {
        fusionSensors.push({ id: 'v2x-virtual', name: 'Coop V2X', type: 'V2X', accuracy: 0.5, active: true });
      }

      const isQuantum = quantumService.shouldEngageQuantum(fusionSensors);
      if (isQuantum && vru.isUserControlled) quantumActiveCount++;

      const error = quantumService.calculateFusedError(fusionSensors);
      
      if (vru.isUserControlled) {
        totalError = error; // Track user error specifically for the main dashboard metric
      }

      let risk = RiskLevel.SAFE;
      nearby.forEach(other => {
        const dist = getDistance(nextPos, other.position);
        if (dist < 5) risk = RiskLevel.CRITICAL;
        else if (dist < 15 && risk !== RiskLevel.CRITICAL) risk = RiskLevel.WARNING;
      });

      if (risk !== RiskLevel.SAFE) collisionWarnings++;

      return {
        ...vru,
        position: nextPos,
        riskLevel: risk,
        localizationError: error
      };
    });

    const nextZones = this.generateZones(nextVRUs);

    this.state = {
      vrus: nextVRUs,
      zones: nextZones,
      timestamp: Date.now(),
      metrics: {
        totalVRUs: nextVRUs.length,
        avgError: totalError, // Focusing on User Error for the dashboard metric
        quantumFusionActive: quantumActiveCount > 0,
        collisionWarnings
      }
    };

    this.notify();
  }

  private notify() {
    this.subscribers.forEach(cb => cb(this.state));
  }

  public updateUserVelocity(vx: number, vy: number) {
    const user = this.state.vrus.find(v => v.isUserControlled);
    if (user) {
      user.velocity = { x: vx, y: vy };
    }
  }

  public setUserType(type: VRUType) {
    const user = this.state.vrus.find(v => v.isUserControlled);
    if (user) {
      user.type = type;
    }
  }

  public toggleUserSensor(sensorId: string) {
    const user = this.state.vrus.find(v => v.isUserControlled);
    if (user) {
      const sensor = user.sensors.find(s => s.id === sensorId);
      if (sensor) {
        sensor.active = !sensor.active;
      }
    }
  }
}

export const simulationService = new SimulationService();