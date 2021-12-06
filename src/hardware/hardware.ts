/**
 * GP Pi Sense | A personal take on IoT and Homekit
 *
 * @author Greg PFISTER
 * @since v0.0.1
 * @copyright (c) 2020, Greg PFISTER. MIT License
 * @license MIT
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import * as log4js from 'log4js';
import { EventEmitter } from 'events';

import { GPLocalApiHttpController, GPLedMatrixController, GPSensorsController } from './controllers';

// TODO: Turn this into actual application parameters
const TURN_ON_TIME_OFFSET_MS = 8 * 3600 * 1000; // in ms since midnight
const TURN_OFF_TIME_OFFSET_MS = 22 * 3600 * 1000; // in ms since midngiht

export class GPHardware extends EventEmitter {
  private _logger: log4js.Logger;

  private _localApiHttpController: GPLocalApiHttpController;

  private _ledMatrixController: GPLedMatrixController;
  private _sensorsController: GPSensorsController;

  private _isLedControllerReady = false;
  private _areSensorsControllerReady = false;

  private _lastRunTimestamp?: Date;

  constructor(logger: log4js.Logger) {
    super();

    // Configure the logger
    this._logger = logger;

    // Local API controller
    this._localApiHttpController = new GPLocalApiHttpController('http://localhost:8080', this.logger);

    // Setup the led matrix
    this._ledMatrixController = new GPLedMatrixController(this.logger);
    this._sensorsController = new GPSensorsController(this.logger);

    // Subscribe when ready
    this._ledMatrixController.on('ready', async () => {
      this._isLedControllerReady = true;
      if (this._isHardwareReady) this.emit('ready');
    });
    this._sensorsController.on('ready', async () => {
      this._areSensorsControllerReady = true;
      if (this._isHardwareReady) this.emit('ready');
    });
  }

  get logger(): log4js.Logger {
    return this._logger;
  }

  private get _isHardwareReady() {
    return this._isLedControllerReady && this._areSensorsControllerReady;
  }

  async start() {
    this._logger.info('[Hardware] Initialization finished');
    const date = new Date();

    // Kick off the data collection (every minute, at a rounded minute)
    const msSinceLastMinute = date.getSeconds() * 1000 + date.getMilliseconds();
    setTimeout(() => { this._readSensorData(); }, 60 * 1000 - msSinceLastMinute);

    // For now, keep the led matrix off
    this._ledMatrixController.turnOff();
    // const msSinceMidnight = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
    // const ms = TURN_OFF_TIME_OFFSET_MS < TURN_ON_TIME_OFFSET_MS
    //   ? msSinceMidnight >= TURN_OFF_TIME_OFFSET_MS && msSinceMidnight < TURN_ON_TIME_OFFSET_MS
    //     ? 0
    //     : msSinceMidnight >= TURN_ON_TIME_OFFSET_MS
    //       ? TURN_OFF_TIME_OFFSET_MS + 24 * 3600 * 1000 - msSinceMidnight
    //       : TURN_OFF_TIME_OFFSET_MS - msSinceMidnight
    //   : msSinceMidnight >= TURN_OFF_TIME_OFFSET_MS || msSinceMidnight < TURN_ON_TIME_OFFSET_MS
    //     ? 0
    //     : TURN_OFF_TIME_OFFSET_MS - msSinceMidnight;
    // setTimeout(() => { this._turnOffLedMatrix() }, ms);
    // const hours = Math.floor(ms / (3600 * 1000));
    // const minutes = Math.floor((ms - (hours * 3600 * 1000)) / (60 * 1000));
    // const seconds = Math.floor((ms - ((hours * 3600 + minutes * 60) * 1000)) / 1000);
    // const milliseconds = ms % 1000;
    // this._logger.info(`Led matrix will be turn off in ${ms}ms (${hours}:${minutes}:${seconds}.${milliseconds})`);
  }

  private async _readSensorData() {
    try {
      if (this._sensorsController) {
        const sensorData = await this._sensorsController.readSensorData();
        await this._localApiHttpController.postSensorData(sensorData);
        this._logger.info(`[Hardware] Temperature: ${Math.floor((sensorData.temperatureFromPressure + sensorData.temperatureFromHumidity) * 10 / 2) / 10}°c, pressure: ${sensorData.pressure}hPa, humidity: ${sensorData.humidity}%`);
      }
    } catch (error) {
      this._logger.error(`[Hardware] Unable to retrieve or save the sensor data: ${error}`);
    } finally {
      const date = new Date();
      const msSinceLastMinute = date.getSeconds() * 1000 + date.getMilliseconds();
      setTimeout(() => { this._readSensorData(); }, 60 * 1000 - msSinceLastMinute);
    }
  }

  private async _turnOffLedMatrix() {
    const date = new Date();
    const msSinceMidnight = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
    const turnOnTimeOffSetMs = TURN_ON_TIME_OFFSET_MS < TURN_OFF_TIME_OFFSET_MS && msSinceMidnight > TURN_ON_TIME_OFFSET_MS
      ? TURN_ON_TIME_OFFSET_MS + 24 * 3600 * 1000
      : TURN_ON_TIME_OFFSET_MS;
    const ms = turnOnTimeOffSetMs - msSinceMidnight;
    setTimeout(() => { this._turnOnLedMatrix(); }, ms);
    this._logger.info('Turning off led matrix');
    await this._ledMatrixController.turnOff();
    const hours = Math.floor(ms / (3600 * 1000));
    const minutes = Math.floor((ms - (hours * 3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((ms - ((hours * 3600 + minutes * 60) * 1000)) / 1000);
    const milliseconds = ms % 1000;
    this._logger.info(`[Hardware] Led matrix will be turn off in ${ms}ms (${hours}:${minutes}:${seconds}.${milliseconds})`);
  }

  private async _turnOnLedMatrix() {
    const date = new Date();
    const msSinceMidnight = (date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
    const turnOffTimeOffSetMs = TURN_OFF_TIME_OFFSET_MS < TURN_ON_TIME_OFFSET_MS
      ? TURN_OFF_TIME_OFFSET_MS + 24 * 3600 * 1000
      : TURN_OFF_TIME_OFFSET_MS;
    const ms = turnOffTimeOffSetMs - msSinceMidnight;
    setTimeout(() => { this._turnOffLedMatrix(); }, ms);
    this._logger.info('Turning on led matrix');
    await this._ledMatrixController.turnOn();
    const hours = Math.floor(ms / (3600 * 1000));
    const minutes = Math.floor((ms - (hours * 3600 * 1000)) / (60 * 1000));
    const seconds = Math.floor((ms - ((hours * 3600 + minutes * 60) * 1000)) / 1000);
    const milliseconds = ms % 1000;
    this._logger.info(`[Hardware] Led matrix will be turn off in ${ms}ms (${hours}:${minutes}:${seconds}.${milliseconds})`);
  }

  static async run(logger: log4js.Logger) {
    // Create the client
    const hardware = new GPHardware(logger);

    // Start the client
    hardware.on('ready', () => {
      hardware
        .start()
        .then(() => hardware.logger.info('[Hardware] Hardware loop started'))
        .catch((error) => hardware.logger.fatal(`[Hardware] Hardware failed with error ${error}`));
    });
  }
}