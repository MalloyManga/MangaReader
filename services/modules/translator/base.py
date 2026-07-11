from abc import ABC, abstractmethod


class BaseTranslator(ABC):
    def __init__(self, model_dir):
        self.model_dir = model_dir
        self.is_ready = False

    def unload(self):
        self.is_ready = False

    @abstractmethod
    def initialize(self):
        pass

    @abstractmethod
    def translate(self, text):
        pass

    @abstractmethod
    def download_model(self, progress_callback=None):
        pass

    @abstractmethod
    def check_model_exists(self):
        pass

    @abstractmethod
    def delete_model(self):
        pass
