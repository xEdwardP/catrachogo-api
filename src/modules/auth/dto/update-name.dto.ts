import { IsString, Length } from 'class-validator';

export class UpdateNameDto {
  @IsString()
  @Length(2, 80)
  name!: string;
}
