import { IsUUID, ValidateIf } from 'class-validator';

export class AssignEtiquetaDto {
  @ValidateIf((o: AssignEtiquetaDto) => o.etiquetaId !== null)
  @IsUUID()
  etiquetaId!: string | null;
}
