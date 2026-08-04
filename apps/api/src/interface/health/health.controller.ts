import { Controller, Get } from '@nestjs/common'
import { SHARED_MODEL_VERSION } from '@repo/shared'

interface HealthResponse {
  status: 'ok'
  service: 'api'
  /** Version du modèle partagé résolue depuis @repo/shared — prouve la résolution cross-workspace. */
  sharedModelVersion: string
}

/**
 * Sonde de santé minimale (Phase 0). Les sondes readiness/liveness complètes
 * (@nestjs/terminus) arrivent en Phase 5 (item C5).
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'api',
      sharedModelVersion: SHARED_MODEL_VERSION,
    }
  }
}
