import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_TRAIL_LIMIT } from '../audit-trail.service';

export class TrailQueryDto {
  @ApiPropertyOptional({ description: 'How many recent entries to return.', default: 25, maximum: MAX_TRAIL_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TRAIL_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Timestamp cursor for the last returned entry.' })
  @IsOptional()
  @IsDateString()
  beforeTimestamp?: string;

  @ApiPropertyOptional({ description: 'ID cursor paired with beforeTimestamp.' })
  @IsOptional()
  @IsUUID()
  beforeId?: string;
}
