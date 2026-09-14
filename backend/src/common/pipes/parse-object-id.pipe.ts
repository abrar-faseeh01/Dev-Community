import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

// Nest ships ParseUUIDPipe, not a Mongo ObjectId equivalent — this app's
// ids are ObjectIds (see User extends Document in user.schema.ts), so a
// malformed :id would otherwise reach Mongoose as a raw string and throw
// an uncaught CastError (500) instead of a clean 400.
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value)) {
      throw new BadRequestException(`"${value}" is not a valid id`);
    }
    return value;
  }
}
