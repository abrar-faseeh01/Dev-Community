import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/dto/trim.transform';

export class CreatePostDto {
  @ApiProperty({ maxLength: 200, example: 'Why we switched to cursor pagination' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ maxLength: 20000, example: 'Offset pagination degrades as pages get deeper — here\'s what we moved to instead...' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body: string;
}
