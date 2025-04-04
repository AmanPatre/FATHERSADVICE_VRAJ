import subprocess
import time
import sys
import signal
import os
import logging
from datetime import datetime
import psutil
import socket

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('service_manager.log'),
        logging.StreamHandler()
    ]
)

class ServiceManager:
    def __init__(self):
        self.processes = []
        # Update ports to match the actual service ports
        self.ports = {
            'mentor_processor': 5003,  # Start mentor processor first
            'api': 5001,              # Then API service
            'workflow': 5002,         # Then workflow service
            'algo': 5000              # Finally algorithm service
        }
        self.services = {
            'mentor_processor': 'mentor_processor.py',
            'api': 'api.py',
            'workflow': 'workflow.py',
            'algo': 'algo.py'
        }
        # Define service dependencies
        self.dependencies = {
            'mentor_processor': [],
            'api': ['mentor_processor'],
            'workflow': ['mentor_processor', 'api'],
            'algo': ['mentor_processor', 'api', 'workflow']
        }

    def is_port_available(self, port):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('localhost', port))
                return True
        except OSError:
            return False

    def check_service_health(self, service_name, port):
        """Check if a service is healthy by making a health check request."""
        try:
            import requests
            max_retries = 5
            retry_delay = 2
            
            for attempt in range(max_retries):
                try:
                    response = requests.get(f'http://localhost:{port}/health', timeout=5)
                    if response.status_code == 200:
                        health_data = response.json()
                        if health_data.get('status') == 'healthy':
                            logging.info(f"Service {service_name} health check passed on attempt {attempt + 1}")
                            return True
                    logging.warning(f"Service {service_name} returned unhealthy status on attempt {attempt + 1}")
                except requests.RequestException as e:
                    logging.warning(f"Health check failed for {service_name} on attempt {attempt + 1}: {str(e)}")
                
                if attempt < max_retries - 1:
                    logging.info(f"Waiting {retry_delay} seconds before next retry...")
                    time.sleep(retry_delay)
            
            return False
        except Exception as e:
            logging.error(f"Error in health check for {service_name}: {str(e)}")
            return False

    def start_services(self):
        try:
            # Create logs directory if it doesn't exist
            if not os.path.exists('logs'):
                os.makedirs('logs')

            # Kill any existing Python services
            subprocess.run(['pkill', '-f', 'python3 .*\\.py'])
            time.sleep(2)  # Wait for processes to clean up
            
            # Start services in dependency order
            started_services = set()
            
            while len(started_services) < len(self.services):
                for service_name, port in self.ports.items():
                    if service_name in started_services:
                        continue
                        
                    # Check if all dependencies are started
                    deps = self.dependencies[service_name]
                    if not all(dep in started_services for dep in deps):
                        logging.info(f"Waiting for dependencies {[dep for dep in deps if dep not in started_services]} before starting {service_name}")
                        continue

                    if not self.is_port_available(port):
                        logging.warning(f"Port {port} is in use, attempting to free it...")
                        subprocess.run(['fuser', '-k', f'{port}/tcp'], stderr=subprocess.DEVNULL)
                        time.sleep(2)
                        if not self.is_port_available(port):
                            logging.error(f"Failed to free port {port}")
                            return False

                    script_path = os.path.join(os.path.dirname(__file__), self.services[service_name])
                    if not os.path.exists(script_path):
                        logging.error(f"Service script not found: {script_path}")
                        return False

                    # Start the service with output redirection to log file
                    log_file = open(f'logs/{service_name}.log', 'w')
                    env = os.environ.copy()
                    env['PYTHONUNBUFFERED'] = '1'
                    
                    try:
                        process = subprocess.Popen(
                            ['python3', script_path],
                            stdout=log_file,
                            stderr=subprocess.STDOUT,
                            env=env
                        )
                        self.processes.append((service_name, process, log_file))
                        logging.info(f"Started {service_name} with PID {process.pid}")
                        
                        # Wait for service to start and become healthy
                        time.sleep(3)  # Give more time for initial startup
                        if self.check_service_health(service_name, port):
                            logging.info(f"Service {service_name} is healthy on port {port}")
                            started_services.add(service_name)
                        else:
                            if process.poll() is not None:
                                logging.error(f"Service {service_name} process exited with code {process.poll()}")
                                log_file.flush()
                                with open(f'logs/{service_name}.log', 'r') as f:
                                    log_content = f.read()
                                    logging.error(f"Service {service_name} log content:\n{log_content}")
                            else:
                                logging.error(f"Service {service_name} failed health check on port {port}")
                            return False
                    except Exception as e:
                        logging.error(f"Error starting {service_name}: {str(e)}")
                        return False

            return True
        except Exception as e:
            logging.error(f"Error starting services: {str(e)}")
            return False

    def stop_services(self):
        logging.info("Shutting down services...")
        # Stop services in reverse order of dependencies
        for service_name, process, log_file in reversed(self.processes):
            try:
                logging.info(f"Stopping {service_name}...")
                process.terminate()
                process.wait(timeout=5)
                log_file.close()
                logging.info(f"Successfully stopped {service_name}")
            except subprocess.TimeoutExpired:
                logging.warning(f"Force stopping {service_name}...")
                process.kill()
            except Exception as e:
                logging.error(f"Error stopping {service_name}: {str(e)}")

def main():
    service_manager = ServiceManager()

    def signal_handler(signum, frame):
        logging.info("Received shutdown signal")
        service_manager.stop_services()
        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Start all services
    if service_manager.start_services():
        logging.info("\nAll services are running successfully!")
        logging.info("Service ports:")
        for service, port in service_manager.ports.items():
            logging.info(f"- {service}: http://localhost:{port}")
        logging.info("\nPress Ctrl+C to stop all services.")
        logging.info("Logs are being written to the 'logs' directory.")
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            signal_handler(signal.SIGINT, None)
    else:
        logging.error("Failed to start all services. Check the logs for details.")
        sys.exit(1)

if __name__ == '__main__':
    main() 