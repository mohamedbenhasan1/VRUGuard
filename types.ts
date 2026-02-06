// Domain Models

export enum VRUType {
  PEDESTRIAN = 'PEDESTRIAN',
  CYCLIST = 'CYCLIST',
  SCOOTER = 'SCOOTER',
  VEHICLE = 'VEHICLE', // Interaction partner
  MOTORCYCLE = 'MOTORCYCLE',
  WHEELCHAIR = 'WHEELCHAIR'
}

export enum RiskLevel {
  SAFE = 'SAFE',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL'
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SensorSource {
  id: string;
  name: string;
  type: 'GPS' | 'LIDAR' | 'CAMERA' | 'UWB' | 'RADAR' | 'V2X';
  accuracy: number; // in meters
  active: boolean;
}

export interface VRU {
  id: string;
  type: VRUType;
  position: Coordinates;
  velocity: { x: number; y: number }; // meters/sec
  heading: number; // degrees
  sensors: SensorSource[];
  riskLevel: RiskLevel;
  localizationError: number; // Estimated error in meters
  isUserControlled?: boolean;
}

export interface Zone {
  id: string;
  bounds: Coordinates[]; // Polygon
  density: number;
  riskLevel: RiskLevel;
}

export interface SimulationState {
  vrus: VRU[];
  zones: Zone[];
  timestamp: number;
  metrics: {
    totalVRUs: number;
    avgError: number;
    quantumFusionActive: boolean;
    collisionWarnings: number;
  };
}

export interface AnalyticsData {
  time: string;
  rmse: number;
  latency: number;
  confidence: number;
}

export interface GeminiRecommendation {
  text: string;
  timestamp: number;
}