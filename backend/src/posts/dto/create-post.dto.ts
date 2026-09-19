import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePostDto {
  @ApiProperty({ maxLength: 200, example: 'Why we switched to cursor pagination' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ maxLength: 20000, example: 'Offset pagination degrades as pages get deeper — here\'s what we moved to instead...' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  body: string;
}
