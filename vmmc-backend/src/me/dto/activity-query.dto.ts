import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ActivityQueryDto {
  @ApiPropertyOptional({ description: 'Number of audit entries to return.', default: 30, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
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
