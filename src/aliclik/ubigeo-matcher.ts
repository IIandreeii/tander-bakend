import { Injectable, Logger } from '@nestjs/common';
import { AliclikClient } from './aliclik.client';
import type { AliclikUbigeoItem } from './aliclik.types';

export interface UbigeoCandidates {
  department?: string | null;
  province?: string | null;
  district?: string | null;
}

export interface MatchedUbigeo {
  department?: string;
  province?: string;
  district?: string;
}

/**
 * Google Maps prefixes admin-area names with the entity type (e.g. "Provincia de Lima",
 * "Departamento de Lima", "Región de Lima"), which Aliclik's ubigeo table does not carry
 * (it just stores "Lima"). Stripped before comparison so both sides land on the same
 * normalized name.
 */
// Note: applied AFTER accent-stripping/lowercasing below, so "región" already reads "region" here.
const UBIGEO_PREFIX_PATTERN = /^(departamento|provincia|region|distrito)\s+de\s+/;

/**
 * Normalizes a free-text ubigeo name (accents, casing, spacing, admin-type prefixes) so
 * it can be compared against Aliclik's canonical `Ubigeo` table names.
 */
function normalizeUbigeoName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(UBIGEO_PREFIX_PATTERN, '');
}

/**
 * Matches free-text department/province/district names (e.g. from Google Maps
 * address_components) against Aliclik's `Ubigeo` table, hierarchically:
 * department (nivel 1) -> province (nivel 2, parentId = department.id) ->
 * district (nivel 3, parentId = province.id).
 *
 * This mirrors the exact-match dependency chain Aliclik's own `validateUbigeo()`
 * enforces server-side, so a warehouse-create call built from the result of
 * `matchUbigeo()` will not fail ubigeo validation.
 *
 * If a level does not match, that level and every level below it are left
 * `undefined` in the result — the caller must treat a partial result as "do not
 * proceed" for any endpoint that requires the full department/province/district trio.
 */
@Injectable()
export class UbigeoMatcher {
  private readonly logger = new Logger(UbigeoMatcher.name);

  constructor(private readonly client: AliclikClient) {}

  async matchUbigeo(candidates: UbigeoCandidates): Promise<MatchedUbigeo> {
    const result: MatchedUbigeo = {};

    if (!candidates.department) {
      return result;
    }

    const departmentMatch = await this.findMatch(1, candidates.department);
    if (!departmentMatch) {
      this.logger.warn(
        `Ubigeo mismatch at department level: "${candidates.department}" does not match any entry in Aliclik's ubigeo table (nivel 1)`,
      );
      return result;
    }
    result.department = departmentMatch.name;

    if (!candidates.province) {
      return result;
    }

    const provinceMatch = await this.findMatch(2, candidates.province, departmentMatch.id);
    if (!provinceMatch) {
      this.logger.warn(
        `Ubigeo mismatch at province level: "${candidates.province}" does not match any entry in Aliclik's ubigeo table (nivel 2, parentId=${departmentMatch.id} / department="${departmentMatch.name}")`,
      );
      return result;
    }
    result.province = provinceMatch.name;

    if (!candidates.district) {
      return result;
    }

    const districtMatch = await this.findMatch(3, candidates.district, provinceMatch.id);
    if (!districtMatch) {
      this.logger.warn(
        `Ubigeo mismatch at district level: "${candidates.district}" does not match any entry in Aliclik's ubigeo table (nivel 3, parentId=${provinceMatch.id} / province="${provinceMatch.name}")`,
      );
      return result;
    }
    result.district = districtMatch.name;

    return result;
  }

  private async findMatch(nivel: 1 | 2 | 3, candidate: string, parentId?: number): Promise<AliclikUbigeoItem | undefined> {
    const items = await this.client.getUbigeoPublic({ nivel, parentId });
    const normalizedCandidate = normalizeUbigeoName(candidate);
    return items.find((item) => normalizeUbigeoName(item.name) === normalizedCandidate);
  }
}
